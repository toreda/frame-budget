# frame-budget — Project Specs

> **Entry point for Claude.** Read this file first. It gives a high-level
> project summary and an index of every system and feature spec, so you can
> quickly identify which spec(s) and source files to ingest for a given task.

## Project summary

`frame-budget` is an NPM package that helps game engines schedule synchronous
work across **multiple frames** instead of cramming it into a single frame.

When the total synchronous work done in one frame exceeds the per-frame time
budget, the frame overruns and the engine visibly lags or freezes. The
per-frame budget is:

```
budgetMs = 1000 / FPS
```

where `FPS` is the engine's target frames per second (commonly 60 → ~16.67ms,
or 120 → ~8.33ms) and `1000` is the number of milliseconds in a second.

The package lets callers register chunks of work and drains them incrementally,
spending only up to the remaining budget each frame and deferring the rest to
subsequent frames — keeping frame times under budget and the engine smooth.

Work is organized in a `category → system → worker` taxonomy, each node carrying
a priority and min/max budget, and each worker assigned to a **phase** that lets
execution be split into priority-ordered, stage-by-stage buckets. Four systems
collaborate, each frame: registry `onUpdate` → scheduler `onUpdate` → executor
runs work.

- **`FrameBroker`** — top-level orchestrator / parent container. Owns the other
  three and drives the per-frame cycle, **brokering** all interaction between
  them: they are fully decoupled and never talk to each other directly. (Name is
  internal; the end-user-facing name is deferred.)
- **`FrameRegistry`** — public entry point and passive store of the
  taxonomy, per-node config, and worker functions. External parties register
  themselves here; it can be global or injected per system.
- **`FrameScheduler`** — planning engine; reads the registry and maintains a reactive
  plan of who-goes-next (priority, active rules, guaranteed min budget, current
  phase). Plans, does not execute.
- **`FrameExecutor`** — does the work; runs the plan handed to it by the broker
  within the time budget, and reports what completed.

The broker mediates: each frame it gets the plan from the scheduler, hands it to
the executor, then reports the results (consumed time, completions) back to the
scheduler so it can re-plan.

## How to use this index

Each task usually maps to one system or feature. Find the relevant entry below,
read its spec, then open the source/test files it points to.

- **Systems** (`_specs/systems/`) — one spec per major system/class.
- **Features** (`_specs/features/`) — cross-cutting requirements and plans that
  may touch multiple systems; scoped to high-level requirements + plan.
- **Decisions** ([decisions.md](decisions.md)) — project-level decision log:
  cross-cutting architectural choices and the trade-offs accepted. Read it
  before reworking how the components interact.

## Systems

| System | Spec | Source | Tests |
| --- | --- | --- | --- |
| `FrameBroker` (orchestrator) | [systems/broker.md](systems/broker.md) | [src/frame/broker.ts](../src/frame/broker.ts), [init.ts](../src/frame/broker/init.ts) | [tests/frame/broker.spec.ts](../tests/frame/broker.spec.ts) |
| `FrameRegistry` | [systems/registry.md](systems/registry.md) | [src/frame/registry.ts](../src/frame/registry.ts) | [tests/frame/registry.spec.ts](../tests/frame/registry.spec.ts) |
| `FrameScheduler` | [systems/scheduler.md](systems/scheduler.md) | [src/frame/scheduler.ts](../src/frame/scheduler.ts) | [tests/frame/scheduler.spec.ts](../tests/frame/scheduler.spec.ts) |
| `FrameExecutor` | [systems/executor.md](systems/executor.md) | [src/frame/executor.ts](../src/frame/executor.ts), [context.ts](../src/frame/context.ts) | [tests/frame/executor.spec.ts](../tests/frame/executor.spec.ts) |

## Features

| Feature | Spec | Systems involved |
| --- | --- | --- |
| Adaptive budget allocation | [features/adaptive-budget.md](features/adaptive-budget.md) | FrameScheduler (allocation/adaptation), FrameRegistry (callback registration + config), FrameBroker (frame budget + diagnostics) |

## Repository layout

| Path | Purpose |
| --- | --- |
| [src/](../src/) | TypeScript source. Public API barrel: [src/index.ts](../src/index.ts). |
| `tests/` | Tests mirroring `src/` paths, named `*.spec.ts` (e.g. `src/frame/broker.ts` → `tests/frame/broker.spec.ts`, `src/frame/registry.ts` → `tests/frame/registry.spec.ts`). |
| `_specs/systems/` | One spec per major system. |
| `_specs/features/` | Feature specs (cross-system requirements + plans). |
| [_specs/decisions.md](decisions.md) | Project-level design decision log. |

## Status

Early scaffolding. `FrameBroker` has its FPS/budget surface implemented and
tested; `FrameRegistry` and `FrameScheduler` are empty stubs; `FrameExecutor` is
a scaffold with method signatures (`executeCategory`/`executeSystem`/
`executePhase`/`executeWorker`) but no behavior yet, plus its `FrameContext`
seam. All four have placeholder tests. Specs exist for all four systems plus the
adaptive-budget feature. Update the tables above as systems are fleshed out and
remove the _(TODO)_ markers once files exist.
</content>
</invoke>
