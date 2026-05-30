# System: `FrameExecutor`

> Status: **stub** — class scaffold with method signatures, no behavior yet
> ([src/frame/executor.ts](../../src/frame/executor.ts)). This spec captures
> intended responsibilities; refine as the design solidifies.

## Source & tests

- Source: [src/frame/executor.ts](../../src/frame/executor.ts),
  [context.ts](../../src/frame/context.ts) (`FrameContext`), and the usage object
  types — [`PhaseUsage`](../../src/phase/usage.ts),
  [`CategoryUsage`](../../src/category/usage.ts),
  [`SystemUsage`](../../src/system/usage.ts),
  [`WorkerUsage`](../../src/worker/usage.ts),
  [`NodeUsage`](../../src/node/usage.ts)
- Tests: [tests/frame/executor.spec.ts](../../tests/frame/executor.spec.ts)

## Purpose

The `FrameExecutor` is the component that **actually does the work**. Where the
[`FrameScheduler`](./scheduler.md) only *plans* (resolves how and when work
should run), the executor *runs* it: each frame the broker hands it a phase's
planned work, the executor walks the taxonomy and runs the worker functions,
measures how much time each consumed, and returns the aggregated measurements.

It is a **stateless, decoupled component**: it holds **no state of its own**
across calls and does **not** talk to the scheduler or registry. The
[`FrameBroker`](./broker.md) orchestrator hands it the plan to run and collects
the results — the executor never pulls from the scheduler itself. All
cross-execution state for the frame lives in the
[`FrameContext`](../../src/frame/context.ts) (`ctx`) passed in, which the broker
creates at frame start and releases at frame end.

> **The executor strictly iterates and executes — nothing else.** No sorting, no
> priority resolution, no allocation decisions happen here. Ordering is baked
> into the schedule at build time (see [scheduler](./scheduler.md)); the executor
> walks the already-ordered structure it is given. Its one extra job is
> **measurement**: it must return the consumption stats the scheduler needs to
> adapt.

## Execution hierarchy

The broker iterates phases and, for each, calls **`executePhase`**. Execution
then descends the taxonomy, each level receiving the **minimum scoped
information** it needs:

```
executePhase(schedule, ctx, phaseWorkers)
  └─ for each category (in schedule order):  executeCategory(...)
       └─ for each system in category:        executeSystem(...)
            └─ for each worker in system:      executeWorker(...)
```

- **`executePhase`** — entry point per phase; iterates the phase's registered
  categories.
- **`executeCategory`** — iterates the category's registered systems.
- **`executeSystem`** — iterates the system's registered workers.
- **`executeWorker`** — runs **one** worker function. Its caller (the
  `executeSystem` parent) is responsible for **measuring** it: take
  `performance.now()` immediately before and after the call; the delta is that
  worker's consumed `deltaTime`. The executor measures around `executeWorker`,
  not inside it.

> **Iterate only what's registered.** A phase iterates the categories / systems
> / workers actually **registered** to it — once per phase. A phase with no
> registered workers has **0 objects to iterate** (no empty-loop cost). The
> heavy lifting (sorting into priority order) never happens during execution —
> only on [schedule build](./scheduler.md#schedule-build).

## Tombstone skip

A worker unregistered **mid-frame** is removed from the registry immediately, but
the schedule the executor is currently walking is a separate cached structure
that still references that worker (see
[broker → mid-frame register/unregister](./broker.md#mid-frame-register--unregister-timing)).
To prevent it running after the caller unsubscribed — and to make
unsubscribe-to-tear-down safe — each worker carries an **`alive`** flag, flipped
to `false` the instant it is unregistered.

> **Required:** before invoking a worker's `fn`, the executor (in `executeSystem`,
> which iterates workers) MUST check `alive` and **skip** any worker where it is
> `false`. It is a single boolean read per worker — no allocation, negligible on
> the hot path. This guarantees an unsubscribed worker never runs again the same
> frame, even if removed after the schedule was fetched, and that a disposed `fn`
> is never called.

## Usage object

Every `execute*` call returns a **usage object** describing what ran, aggregated
**bottom-up** through the hierarchy:

- **per worker** — call count + summed ms consumed for that worker;
- **per system** — totals across its workers;
- **per category** — totals across its systems;
- **per phase** — totals across its categories.

`executePhase` returns the phase-level rollup (with the nested per-category /
per-system / per-worker breakdown). The broker accumulates these across the
frame's phases and hands the result to
[`scheduler.updateUsage(consumed)`](./scheduler.md#public-surface--the-broker-contract), which drives the
adaptive budget updates. **The executor must return measured consumption** —
without it the schedule cannot adapt.

## Responsibilities

- Receive a phase's planned work for the frame from the
  [`FrameBroker`](./broker.md) (already in priority order from schedule build).
- Walk `category → system → worker` and execute the worker functions, passing
  each level its minimum scoped information.
- **Measure** each worker via `performance.now()` deltas around `executeWorker`.
- **Return the usage object** (call counts + ms, aggregated per worker / system /
  category / phase) so the broker can feed the scheduler.
- Stop when the frame's time budget is exhausted; remaining work is deferred to
  the next frame.

## Relationship to other systems

- Driven by [`FrameBroker`](./broker.md) once per frame: receives the plan, runs
  it, returns results.
- Does **not** interact with the [`FrameScheduler`](./scheduler.md) or
  [`FrameRegistry`](./registry.md) directly — `FrameBroker` mediates.
- Spends against the frame time budget (see
  [broker.md → time budget](./broker.md) — ownership of remaining-time tracking
  is an open question; the executor is a likely home since it's what consumes
  time).

## Open questions

- Error handling when a worker throws mid-execution: skip, retry, unregister?
  (Does the usage object still record the partial `deltaTime` up to the throw?)
- Mid-phase budget exhaustion: does `executeWorker` get a remaining-budget
  argument so it can decline to start, or does the parent stop iterating once
  the running total reaches budget?

### Resolved

- **Cycle granularity** — the broker hands the executor a **whole phase** at a
  time (`executePhase`), not one unit; reactive re-resolution happens between
  frames via `getSchedule()`/`updateUsage()`, not mid-phase.
- **Remaining-time / measurement ownership** — the executor measures
  (`performance.now()` deltas around `executeWorker`) and returns the
  [usage object](#usage-object); the scheduler adapts from it.
- **Worker invocation contract** — a worker is `() => boolean` (bounded chunk;
  `true` = more remains), resolved in
  [adaptive-budget.md](../features/adaptive-budget.md#worker-contract). The
  boolean is both the "complete?" and demand signal.
</content>
