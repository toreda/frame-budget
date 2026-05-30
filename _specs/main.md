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

Work is organized as a single **arbitrary-depth tree** of `RegistryNode`s (each
node carries a priority and owns both workers and child nodes; `category →
system → worker` is just a common depth-3 example). Each worker is tagged with a
**phase**; phases run in order, letting execution be split into priority-ordered,
stage-by-stage buckets so a later phase can depend on an earlier one. Four systems
collaborate, each frame: registry `onUpdate` → scheduler `onUpdate` → executor
runs work.

- **`FrameBroker`** — top-level orchestrator / parent container **and the
  package's sole public entry point**. Owns the other three (which are internal)
  and drives the per-frame cycle, **brokering** all interaction between them:
  they are fully decoupled and never talk to each other directly. Consumers
  register work, add phases, and configure the budget through the broker; it also
  implements a `@toreda/lifecycle` delegate for startup/shutdown. (Name is
  internal; the end-user-facing name is deferred.)
- **`FrameRegistry`** — **internal** passive store of the work tree, per-node
  config, and worker functions, owned by the broker. Consumers register via
  `broker.registerWorker(...)`, not against the registry directly.
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

| System                       | Spec                                         | Source                                                                                   | Tests                                                             |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `FrameBroker` (orchestrator) | [systems/broker.md](systems/broker.md)       | [src/frame/broker.ts](../src/frame/broker.ts), [init.ts](../src/frame/broker/init.ts)    | [tests/frame/broker.spec.ts](../tests/frame/broker.spec.ts)       |
| `FrameRegistry`              | [systems/registry.md](systems/registry.md)   | [src/frame/registry.ts](../src/frame/registry.ts)                                        | [tests/frame/registry.spec.ts](../tests/frame/registry.spec.ts)   |
| `FrameScheduler`             | [systems/scheduler.md](systems/scheduler.md) | [src/frame/scheduler.ts](../src/frame/scheduler.ts)                                      | [tests/frame/scheduler.spec.ts](../tests/frame/scheduler.spec.ts) |
| `FrameExecutor`              | [systems/executor.md](systems/executor.md)   | [src/frame/executor.ts](../src/frame/executor.ts), [context.ts](../src/frame/context.ts) | [tests/frame/executor.spec.ts](../tests/frame/executor.spec.ts)   |

## Features

| Feature                    | Spec                                                       | Systems involved                                                                                                                 |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Adaptive budget allocation | [features/adaptive-budget.md](features/adaptive-budget.md) | FrameScheduler (allocation/adaptation), FrameRegistry (callback registration + config), FrameBroker (frame budget + diagnostics) |

## Repository layout

| Path                                 | Purpose                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/](../src/)                      | TypeScript source. Public API barrel: [src/index.ts](../src/index.ts).                                                                                                 |
| `tests/`                             | Tests mirroring `src/` paths, named `*.spec.ts` (e.g. `src/frame/broker.ts` → `tests/frame/broker.spec.ts`, `src/frame/registry.ts` → `tests/frame/registry.spec.ts`). |
| `_specs/systems/`                    | One spec per major system.                                                                                                                                             |
| `_specs/features/`                   | Feature specs (cross-system requirements + plans).                                                                                                                     |
| [\_specs/decisions.md](decisions.md) | Project-level design decision log.                                                                                                                                     |

## Status

Early scaffolding. `FrameBroker` has its FPS/budget surface plus the public
registration API (`registerWorker` → unsubscribe, `addPhase`, `start`/
`isRunning`) implemented and tested; the internal `FrameRegistry` has worker
registration/unregistration into a shared **arbitrary-depth** `RegistryNode` tree
(phase tagged per worker) with ensure-path node creation implemented and tested;
the per-frame cycle and `@toreda/lifecycle` delegate are not yet built.
`FrameScheduler` is an empty stub; `FrameExecutor` is
a scaffold with method signatures (`executeCategory`/`executeSystem`/
`executePhase`/`executeWorker`) but no behavior yet, plus its `FrameContext`
seam. All four have placeholder tests. Specs exist for all four systems plus the
adaptive-budget feature. Update the tables above as systems are fleshed out and
remove the _(TODO)_ markers once files exist.
</content>
</invoke>
