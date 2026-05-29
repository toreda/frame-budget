# System: `FrameRegistry`

> Status: **stub** — class is an empty scaffold
> ([src/frame/registry.ts](../../src/frame/registry.ts)).
> This spec captures intended responsibilities; refine as the design solidifies.

## Source & tests

- Source: [src/frame/registry.ts](../../src/frame/registry.ts)
- Tests: [tests/frame/registry.spec.ts](../../tests/frame/registry.spec.ts)

## Purpose

`FrameRegistry` is the **public entry point** of the package and the
**store** for all frame-budgeted work and its configuration. It holds the work
taxonomy (`category` → `system` → `worker`), each node's scheduling config
(priority, min/max budget, phase), and the worker functions themselves.

It is the object external parties interact with: it can be used as a **global**
or **passed/injected into each system**. Every external party **registers
itself** with the registry — categories, systems, and workers come from the
consumers, not from the package.

It is a passive structure with respect to execution: it does **not** decide who
runs each frame. The [`FrameScheduler`](./scheduler.md) reads the registry at
[schedule build](./scheduler.md#schedule-build) to resolve execution order; the
[`FrameExecutor`](./executor.md) measures consumption and the scheduler adapts
from it. The registry's job is to make the taxonomy, config, and workers
queryable so the scheduler can sort them into priority order.

## Taxonomy

A three-level hierarchy of arbitrary, user-defined names that roughly mirrors
"groups containing classes containing functions":

- **`category`** — broad, user-defined grouping containing zero or more
  systems.
- **`system`** — an individual system owning one or more worker functions that
  handle frame-budgeted work.
- **`worker`** — the name identifying one specific function that performs
  frame-budgeted work.

Fully qualified, work is addressed as `category.system.worker`.

```
category
└── system
    └── worker  (a single function doing budgeted work)
```

## Per-node scheduling config

Each registered **category**, **system**, and **worker** carries:

- **`priority`** — optional unsigned int (higher = more important; default
  `20`). Carried at **all three levels** — category and system priority order
  their respective iterations, not just workers. Drives the scheduler's
  descending resolution order, the shared-pool weight, and overflow shed order.
  **Ties break alphabetically by name**, so leaving every node at the default
  priority yields deterministic **alphabetical** execution order. See
  [adaptive-budget.md → Priority](../features/adaptive-budget.md#priority).
- **`fixedMin`** — non-adaptive hard floor (% or ms; default `0`); the bottom of
  the node's adaptive range.
- **adaptive range / stepping** — `stepUpMin`/`stepDownMin` (and optional
  `stepUpMax`/`stepDownMax`) governing how the earned floor and ceiling move.
- **`lookbackSec`** — optional per-node override of the usage-statistics window.

These feed the **adaptive two-pool allocation** owned by the
[`FrameScheduler`](./scheduler.md); the registry only **stores** them. The full
meaning of each field — `fixedMin` vs earned `adaptiveMin` vs dynamic `max`, the
shared-gated stepping, and the lookback window — is specified in
**[features/adaptive-budget.md](../features/adaptive-budget.md)**.

Config exists at all three levels; how a worker's effective allocation is
derived from its category/system/worker config is a
[scheduler concern](./scheduler.md) (open question below).

## Phase

Each **worker** is assigned to a **phase**. Phases let the scheduler split each
frame's execution into priority-ordered buckets of work. Phase is optional for
many consumers but essential for some (e.g. staged pipelines). See
[scheduler.md → Phase](./scheduler.md#phase) for how phase ordering drives
execution.

## Responsibilities

- **Register** categories, systems, and workers, with their priority, min/max
  budget, and (for workers) phase.
- Store worker functions and their `category.system.worker` identity.
- Provide priority-ordered iteration/queries for the scheduler.
- **Unregister** / update nodes; report what is registered.

## Intended public surface (draft)

> Not yet implemented — proposed shape, subject to change.

- `register(category, system, worker, fn, config)` — add a worker; auto-create
  category/system nodes as needed.
- Configure priority / min / max / phase per node.
- `unregister(...)` — remove a node (and cascade?).
- Priority-ordered iteration consumed by the [`FrameScheduler`](./scheduler.md).

## Relationship to other systems

- [`FrameScheduler`](./scheduler.md) reads the registry at schedule build to
  resolve allocation.
- [`FrameBroker`](./broker.md) owns the registry and supplies the per-frame
  budget (`budgetMs`) the scheduler spends against registered workers.

## Open questions

- How is a worker's effective allocation composed from category/system/worker
  priority and adaptive range? (sum, override, nested clamp?)
- Identity collisions: are `category`/`system`/`worker` names unique globally or
  only within their parent?
- Cascade semantics on unregister (removing a system removes its workers?).

### Resolved by [adaptive-budget.md](../features/adaptive-budget.md)

- **Worker function signature** — a worker is `() => boolean` (a bounded chunk
  per call; `true` = more work remains). The broker calls it repeatedly within
  budget; the boolean is both the keep-going and the demand signal.
  </content>
