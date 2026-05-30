# System: `FrameRegistry`

> Status: **stub** — class is an empty scaffold
> ([src/frame/registry.ts](../../src/frame/registry.ts)).
> This spec captures intended responsibilities; refine as the design solidifies.

## Source & tests

- Source: [src/frame/registry.ts](../../src/frame/registry.ts)
- Tests: [tests/frame/registry.spec.ts](../../tests/frame/registry.spec.ts)

## Purpose

`FrameRegistry` is the **internal store** for all frame-budgeted work and its
configuration. It holds the arbitrary-depth `RegistryNode` work tree, each node's
scheduling config (priority), and the phase-tagged worker functions themselves.

> **Internal, not public.** Earlier drafts made the registry the package's public
> entry point. It is now **owned by and private to** the
> [`FrameBroker`](./broker.md), which is the package's
> [sole public surface](./broker.md#sole-public-entry-point). Consumers register
> through `broker.registerWorker(...)`, never against the registry directly — so
> the broker can run housekeeping/rebuilds around every change. The registry's
> own `register`/`unregister` methods are an internal contract the broker calls.

It is a passive structure with respect to execution: it does **not** decide who
runs each frame. The [`FrameScheduler`](./scheduler.md) reads the registry at
[schedule build](./scheduler.md#schedule-build) to resolve execution order; the
[`FrameExecutor`](./executor.md) measures consumption and the scheduler adapts
from it. The registry's job is to make the taxonomy, config, and workers
queryable so the scheduler can sort them into priority order.

## Taxonomy

> **Implemented model — arbitrary depth.** The taxonomy is no longer a fixed
> three-level `category → system → worker` shape. It is an **arbitrary-depth
> tree** of uniform `RegistryNode`s ([src/registry/node.ts](../../src/registry/node.ts)):
> each node carries a priority and owns **both** workers (leaf functions that run
> directly at that node) and child nodes (deeper structure). Consumers impose
> whatever depth and grouping suits them — one size does not fit all. The
> `category/system/worker` naming below is retained only as the *motivating
> example* of a depth-3 tree.

There is **one shared tree**, not one per phase. A worker is addressed by
`(path, workerName, phase)`, where `path` is the array of node names from the
root down to the worker's owning node, and `phase` is a per-worker tag (see
[Phase](#phase)). Only the nodes needed to hold a registered worker are ever
created (ensure-path), and the node spine is created **once** regardless of how
many phases register through it.

```
(root)
└── engine                ← RegistryNode (priority, workers, children)
    └── renderer          ← RegistryNode
        ├── draw @main     ← Worker (() => boolean, tagged with its phase)
        └── draw @cleanup  ← same id, different phase — a distinct worker
```

> **TBD — execution order within a node.** A node owns both its own workers and
> child groups; whether the executor runs a node's workers before descending
> into its children (or vice-versa) is unsettled. Running the node's own workers
> first fits the priority model, since workers run in priority order.

> **Drift note.** The [executor](./executor.md) `executeCategory`/`executeSystem`
> methods and the per-level usage types
> ([`CategoryUsage`](../../src/category/usage.ts) /
> [`SystemUsage`](../../src/system/usage.ts)) still assume the old fixed three
> levels; they need reworking to the uniform-node model.

## Per-node scheduling config

Every **node** and every **worker** carries:

- **`priority`** — optional unsigned int (higher = more important; default
  `20`). Carried by **every node and worker** — a node's priority orders it
  against its siblings, not just workers. Drives the scheduler's
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

Config exists on every node; how a worker's effective allocation is
derived from the config of its ancestor nodes is a
[scheduler concern](./scheduler.md) (open question below).

## Phase

Phase is a **per-worker tag**, not a partition of the tree. The tree is shared
across phases — only leaf workers carry a phase — so a node's spine is created
once no matter how many phases register through it. (Per-worker-_phase_, not
per-tree, because a worker per phase is the **niche** case: duplicating the whole
hierarchy per phase costs structure for phases that hold no workers there.)

Phases exist to support **structured execution** that would otherwise need an
explicit dependency graph. Every worker in phase A is guaranteed to run before
every worker in phase B, so phase B is the natural home for a worker that needs
state set up or updated in phase A. This is also why a worker **id is the same
across phases**: identical naming lets a phase-B worker reach the context a
phase-A worker of the same id produced — and verify it ran as expected. Phases
are optional for many consumers but essential for staged pipelines. See
[scheduler.md → Phase](./scheduler.md#phase) for how phase ordering drives
execution.

## Responsibilities

- **Register** workers at an arbitrary-depth `path`, tagged with a phase, with
  their priority; auto-create the intermediate nodes the path needs.
- Store worker functions and their `(path, worker, phase)` identity.
- Provide priority-ordered iteration/queries for the scheduler.
- **Unregister** / update nodes; report what is registered.

## Internal surface (broker-facing)

> **Partly implemented.** `register`/`unregister` and node/worker lookups exist
> ([src/frame/registry.ts](../../src/frame/registry.ts)); per-node config setters
> remain proposed. This surface is **internal** — only the
> [`FrameBroker`](./broker.md) calls it (consumers use `broker.registerWorker`).

- `register(path, worker, fn, phase, config?)` — add a worker at `path`, tagged
  with `phase`; auto-create the nodes along `path` as needed. **Implemented.**
- `unregister(path, worker, phase): boolean` — **tombstone** the worker
  (`alive = false`) then remove it; leaves intermediate nodes in place. The
  tombstone lets the [executor](./executor.md#tombstone-skip) skip a copy still
  sitting in this frame's schedule (mid-frame unregister safety). Backs the
  broker's unsubscribe handle and `unregisterWorker(s)`. **Implemented.**
- `unregisterAll(): void` — tombstone every worker in the tree, then drop it
  (shutdown teardown / leak prevention, with the same mid-frame guarantee). The
  broker calls it on shutdown; not yet exposed publicly. **Implemented.**
- `rootNode()` / `node(path)` / `worker(path, worker, phase)` —
  lookups. **Implemented.**
- `snapshot(): RegistrySnapshot` — a **deep, plain-data copy** of the whole work
  tree for debugging (printing / asserting in tests / `JSON.stringify`). Shares
  no identity with the live tree — `Map`s become arrays and each worker's live
  `fn` is reduced to a `hasFn` boolean, so the copy holds no callable reference
  and mutating it cannot touch registry state. `undefined` when nothing is
  registered. **Heavy** (walks + allocates the whole tree) — a diagnostics tool,
  not a per-frame call. Surfaced publicly via
  [`broker.registrySnapshot()`](./broker.md#debug-snapshots). Types:
  [`RegistrySnapshot`](../../src/registry/snapshot.ts),
  [`RegistryNodeSnapshot`](../../src/registry/node/snapshot.ts),
  [`WorkerSnapshot`](../../src/worker/snapshot.ts). **Implemented.**
- Configure priority / min / max per node (currently only worker priority).
- Priority-ordered iteration consumed by the [`FrameScheduler`](./scheduler.md).

## Relationship to other systems

- [`FrameScheduler`](./scheduler.md) reads the registry at schedule build to
  resolve allocation.
- [`FrameBroker`](./broker.md) owns the registry and supplies the per-frame
  budget (`budgetMs`) the scheduler spends against registered workers.

## Open questions

- How is a worker's effective allocation composed from its ancestor nodes'
  priority and adaptive range down the tree? (sum, override, nested clamp?)
- **Execution order within a node** — run a node's own workers before
  descending into its child nodes, or vice-versa? (Leaning workers-first; see
  Taxonomy.)
- Identity is **scoped to the parent**: node names are unique among a node's
  children; worker identity is `(name, phase)` within a node, so the same worker
  id deliberately recurs across phases. Confirm no global-uniqueness requirement
  is needed.
- Cascade semantics on unregister (removing a node removes its subtree?).

### Resolved by [adaptive-budget.md](../features/adaptive-budget.md)

- **Worker function signature** — a worker is `() => boolean` (a bounded chunk
  per call; `true` = more work remains). The broker calls it repeatedly within
  budget; the boolean is both the keep-going and the demand signal.
  </content>
