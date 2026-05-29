# System: `FrameExecutor`

> Status: **stub** — class scaffold with method signatures, no behavior yet
> ([src/frame/executor.ts](../../src/frame/executor.ts)). This spec captures
> intended responsibilities; refine as the design solidifies.

## Source & tests

- Source: [src/frame/executor.ts](../../src/frame/executor.ts),
  [context.ts](../../src/frame/context.ts) (`FrameContext`)
- Tests: [tests/frame/executor.spec.ts](../../tests/frame/executor.spec.ts)

## Purpose

The `FrameExecutor` is the component that **actually does the work**. Where the
[`FrameScheduler`](./scheduler.md) only *plans* (resolves how and when work should
run), the executor *runs* it: each frame it receives the planned work, executes
it within the available time budget, and reports what completed.

It is a **decoupled component**: it maintains its own state and does **not** talk
to the scheduler or registry. The [`FrameBroker`](./broker.md) orchestrator hands
it the plan to run and collects the results — the executor never pulls from the
scheduler itself.

## Responsibilities

- Receive the planned work for the frame from the [`FrameBroker`](./broker.md)
  orchestrator (already in priority/phase order).
- Execute that work for the current frame.
- **Report what completed** (and time consumed) back to the orchestrator, which
  relays it to the scheduler so it can re-plan (e.g. advance a phase when its
  work drains).
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

- Granularity of the orchestrator cycle: does `FrameBroker` hand the executor
  **one unit at a time** (calling back to the scheduler between each, enabling
  reactive re-resolution mid-frame), or a **batch/plan** for the whole frame?
  This is really a [`FrameBroker`](./broker.md) (cycle) question.
- Where remaining-time tracking lives (see [broker.md](./broker.md)).
- Worker invocation contract: how does a worker do partial work and yield
  (generator, `step()`, return "more remaining")? This is shared with the
  [registry](./registry.md) open questions.
- How is "complete" defined and signaled — per worker, per unit of work?
- Error handling when a worker throws mid-execution: skip, retry, unregister?
</content>
