# System: `FrameScheduler`

> Status: **stub** — class is an empty scaffold
> ([src/frame/scheduler.ts](../../src/frame/scheduler.ts)). This spec captures
> intended responsibilities and the allocation model; refine as the design
> solidifies.

## Source & tests

- Source: [src/frame/scheduler.ts](../../src/frame/scheduler.ts)
- Tests: [tests/frame/scheduler.spec.ts](../../tests/frame/scheduler.spec.ts)

## Purpose

The `FrameScheduler` is the **per-frame planning engine**. It resolves execution
order from each node's **priority** and the **current phase**, reading the
[`FrameRegistry`](./registry.md), and maintains a plan of what should run
next within the frame's [`FrameBroker`](./broker.md).

Its concern is scoped to **planning and maintaining a plan** — it does **not**
do the work, and it does **not** talk to the executor. The scheduler is a
**decoupled component**: it maintains its own state and communicates only with
the [`FrameBroker`](./broker.md) orchestrator. Each frame, `FrameBroker` asks it
for the plan, then later calls back with consumed time / completion results so
it can re-plan. The registry is the passive store of taxonomy + config; the
scheduler is the active decision-maker; the [`FrameExecutor`](./executor.md) is the
doer — and `FrameBroker` brokers between them.

### Reactive

The schedule is **not computed once per frame and then run blindly**. The
scheduler is **reactive**: it continuously updates the schedule as conditions
change during the frame, including:

- **Existing/used budget** — as workers consume time, remaining budget shrinks
  and the next-up decision is re-resolved against what's actually left.
- **Phase completion** — when the current phase drains, the scheduler advances
  to the next phase and re-resolves eligibility.
- Other state changes that affect who is eligible or how much budget remains
  (active rules, newly registered/unregistered work).

In other words, "who goes next" is resolved repeatedly as the frame progresses,
not fixed up front.

## Public surface — the broker contract

The scheduler exposes exactly two methods to the [`FrameBroker`](./broker.md);
the broker calls them once per frame and nothing else touches the scheduler.

- **`getSchedule()`** — return the current plan for the broker to execute this
  frame. Internally it calls a private **`build()`** to (re)compute the
  priority-ordered structure, but **only when something changed** — a
  registration/unregistration, a config/priority edit, or usage statistics that
  shifted enough to matter. When nothing changed it returns the cached schedule.
  **Sorting / priority resolution happens here, never during execution.**
- **`updateUsage(consumed)`** — accept the [usage object](./executor.md#usage-object)
  the executor measured (call counts + ms, aggregated per worker / system /
  category / phase), relayed by the broker. This feeds the adaptive stepping and
  usage statistics, and **invalidates the cached schedule** when the shift is
  large enough to warrant a rebuild on the next `getSchedule()`.

### Schedule build

`build()` is the **only** place ordering work happens. It reads the
[`FrameRegistry`](./registry.md) and produces the per-phase, priority-ordered
`category → system → worker` structure the executor walks. Because the executor
strictly iterates, all sorting cost is paid here — on change — not per frame.

**Batching for performance.** `updateUsage` need not trigger a rebuild every
frame. The scheduler **may batch** usage and actually recompute only every `n`
frames: a single frame that slightly exceeds budget and returns to normal the
next frame is cheaper than rebuilding the schedule every frame. The rebuild is
the expensive operation to amortize; per-frame spending against an existing
schedule is cheap.

## What it allocates against

Work is organized by the registry's taxonomy `category.system.worker`, and each
node carries `priority` and an adaptive budget range. The scheduler spends the
frame's [`FrameBroker`](./broker.md) budget across these nodes.

> **Allocation is adaptive, not static.** Rather than fixed per-node ms limits,
> the scheduler adapts from the executor's measured execution
> (`performance.now()` deltas around each worker callback, returned via
> [`updateUsage`](#public-surface--the-broker-contract)) and dynamically
> reallocates via a **two-pool model**
> (dedicated + shared) with a per-node range `fixedMin ≤ adaptiveMin ≤ max`. The
> full model — worker contract, two pools, shared-gated stepping, the `fixedMin`
> artifact-protection floor, and the decay-weighted lookback window — is
> specified in its own feature spec:
> **[features/adaptive-budget.md](../features/adaptive-budget.md)**. That spec is
> the source of truth for adaptive allocation; this section summarizes how it
> slots into the scheduler.

### Three timescales in one class

All adaptive/timing logic lives here, but three loops run at different rates and
must stay conceptually distinct (see the feature spec):

- **Per-frame planning** (~1 frame): resolve who-goes-next by priority + phase.
- **Adaptive stepping** (~5 frames): walk each node's `adaptiveMin`/`max` up
  (shared-gated) or down (slow decay) toward measured need.
- **Usage statistics** (seconds; default 30s, decay-weighted lookback): compute
  the typical-usage / p95 statistics that stepping chases.

## Resolving "who goes next"

Each frame the scheduler iterates contenders in **descending priority order**
(higher = more important, resolved first) and resolves the next worker to run.
This is a multi-factor decision based on:

- **Priority** — unsigned int; higher = more important. Drives the descending
  walk order, the shared-pool weight, and overflow shed order. Default `20`. The
  priority-ordered plan is **cached and rebuilt reactively** (on
  register/unregister/config/usage change), not recomputed from scratch each
  frame. Full definition in
  [adaptive-budget.md → Priority](../features/adaptive-budget.md#priority).
- **Active Rules** — runtime rules that gate or modify what is eligible to run
  _(rule model TBD — see open questions)_.
- **Budget floor** — each node's effective floor (`fixedMin`, then earned
  `adaptiveMin`) is honored before discretionary/shared budget is distributed,
  so low-priority-but-floored work still advances. See
  [adaptive-budget.md](../features/adaptive-budget.md) for how the floor is
  derived and decays.
- **Current Phase** — only work in the active phase is eligible; the scheduler
  advances phases in order (see below).

## Phase

Phase controls the **order in which work is processed** within a frame by
splitting execution into priority-ordered buckets.

- Each worker is assigned a phase (in the [registry](./registry.md#phase)).
- The scheduler processes phases **in order**: it works the current phase's
  pending work (still split across frames within budget) before moving on to the
  next phase.
- Motivating example — an ingestion pipeline `ingestion → parsing → processing`:
  resolving purely by priority could interleave all three phases. Sometimes it's
  better to drain **all** pending ingestion, then parse **all** of that, then
  process **all** the parsed objects. Each phase's total work is still spread
  across multiple frames, but phases force the work to happen in stage order.
- Phase is optional for many consumers but essential for staged pipelines.

### Phase set & ordering

The set of phases and their order is fixed at construction via
[`FrameBrokerInit.phases`](./broker.md#construction--frramebrokerinit) (see
broker spec). Key points:

- **Default phases.** If `init.phases` is omitted, three phases are used:
  `setup → main → cleanup` (the `DefaultPhase` union).
- **Custom phases.** If `init.phases` is provided, **only** those phases exist,
  and the **array order is the execution order**.
- The broker stores the phases as a `Set<PhaseT>` and uses it to **validate**
  any call that takes a phase argument — an invalid phase is rejected.
- Ordering is initially derived from array position. More expressive ordering
  rules may come later (see open questions); for now order = declared order.

## Responsibilities

- Begin each frame with a fresh [`FrameBroker`](./broker.md).
- Resolve execution order from priority + current phase, reading the
  [registry](./registry.md).
- **React** to changing state during the frame — re-resolve who-goes-next as
  budget is used, phases complete, and eligibility changes (see Reactive above).
- Honor guaranteed min budgets, then distribute remaining budget by priority,
  clamped by each node's max.
- Respect phase ordering: drain/advance phases in order.
- Apply active rules to gate eligibility.
- Produce the plan on request and consume the update (consumed time, completed
  work) the orchestrator passes back. The scheduler plans — it does not execute,
  and it does not call the executor.

## Relationship to other systems

- Reads [`FrameRegistry`](./registry.md) for taxonomy + config.
- Communicates **only** with the [`FrameBroker`](./broker.md) orchestrator:
  hands it the plan, receives consumed-time/completion updates back. It does not
  interact with the [`FrameExecutor`](./executor.md) directly — `FrameBroker`
  mediates.

## Open questions

- **Active Rules** model: what is a rule? (predicate gating eligibility,
  dynamic priority/budget adjustment, enable/disable toggles?)
- Min/max composition across the three taxonomy levels — how do a worker's,
  system's, and category's adaptive ranges combine? (Note: an ms `fixedMin`
  deliberately **bypasses** parent caps — see
  [adaptive-budget.md](../features/adaptive-budget.md#ms-fixedmin-bypasses-parent-caps).)
- Phase advancement: within a frame (drain phase 1, then phase 2 same frame if
  budget remains) or one phase per frame? What if a phase never drains?
- Who owns the frame loop — does the scheduler hook `requestAnimationFrame`, or
  does the host engine call a `tick()` each frame?

### Resolved by [adaptive-budget.md](../features/adaptive-budget.md)

- **Reactive timescales** — the earlier "reactive" notion is now split into three
  explicit loops (per-frame planning, adaptive stepping, usage statistics); see
  [Three timescales](#three-timescales-in-one-class).
- **`min` overflow arbitration** — when total `fixedMin` exceeds the frame budget,
  guarantees are filled in **priority order until the frame is full**; the rest
  are deferred (the frame is never overrun).
- **Starvation beyond guaranteed min** — the **shared pool** (priority-weighted
  per-frame cap) ensures any task can always run even when its floor has decayed
  to 0; leaning on the shared cap is the signal that regrows its floor.
</content>
