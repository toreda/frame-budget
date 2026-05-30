# System: `FrameBroker`

> Status: **stub** — class is an empty scaffold ([src/frame/broker.ts](../../src/frame/broker.ts)).
> This spec captures intended responsibilities and open questions; refine as the
> design solidifies.
>
> **Naming:** internally this is `FrameBroker`, which describes its role (it
> brokers between decoupled components). The end-user-facing name is undecided
> and deferred — we are not carrying dual naming during planning.

## Source & tests

- Source: [src/frame/broker.ts](../../src/frame/broker.ts)
- Tests: `tests/frame/broker.spec.ts` _(TODO — not yet created)_

## Purpose

`FrameBroker` is the **top-level orchestrator and parent container** for the
package's components — the [`FrameRegistry`](./registry.md),
[`FrameScheduler`](./scheduler.md), and [`FrameExecutor`](./executor.md).

### Why a broker: fully decoupled components

The broker pattern earns its place because the three components are **totally
independent and separate**: they do **not** communicate with each other and each
maintains **its own state**. The scheduler does not call the executor; the
executor does not read the scheduler. There is no shared state between them.

`FrameBroker` owns all three and **mediates every interaction** per frame. It is
the only component that knows about the others — hence "broker."

The mediation is done with **direct method calls and return values**, not an
event bus — a deliberate choice to keep the per-frame hot path allocation-light
in a latency-sensitive host loop. See
[decisions → DEC-001](../decisions.md#dec-001--components-communicate-by-direct-calls--returns-not-events).

### Per-frame cycle

The three components are physically isolated and never call each other; the
broker is what passes information between them. Each frame the broker drives
this exact sequence:

1. **Get the schedule.** Call [`scheduler.getSchedule()`](./scheduler.md). The
   scheduler returns its current plan, internally rebuilding it (via a private
   `build()`) only when something changed — never every frame (see
   [scheduler → schedule build](./scheduler.md#schedule-build)).
2. **Execute, phase by phase.** The broker owns the ordered phase list and
   iterates it. For each phase it calls
   [`executor.executePhase(schedule, ctx, phaseWorkers)`](./executor.md), which
   walks `category → system → worker` and runs the work. The broker carries the
   per-frame [`FrameContext`](../../src/frame/context.ts) (`ctx`) across phases;
   it is released when the frame ends.
3. **Collect usage.** `executePhase` returns a **usage/consumption object**
   (call counts + ms consumed, aggregated per worker → system → category →
   phase — see [executor → usage object](./executor.md#usage-object)). The
   broker accumulates these across phases for the frame.
4. **Feed usage back.** The broker calls
   [`scheduler.updateUsage(consumed)`](./scheduler.md#public-surface--the-broker-contract), which
   triggers the scheduler's internal adaptive updates. For performance the
   scheduler **may batch** stats and actually recompute only every `n` frames:
   one frame of slight budget overrun that self-corrects the next frame is
   cheaper than rebuilding the schedule every frame.

(The [`FrameRegistry`](./registry.md) is the passive store the scheduler reads
during `build()`; the broker does not push per-frame updates into it.)

## Construction — `FrameBrokerInit`

`FrameBroker` is generic over its phase type and takes a **single constructor
argument**, `init`, of type `FrameBrokerInit` (defined in
[src/frame/broker/init.ts](../../src/frame/broker/init.ts)). `FrameBrokerInit`
declares the required and optional properties for constructing a broker.

```ts
type DefaultPhase = 'setup' | 'main' | 'cleanup';

interface FrameBrokerInit<PhaseT extends string = DefaultPhase> {
    /**
     * Phases in execution order. Optional.
     * - Omitted  → defaults to ['setup', 'main', 'cleanup'].
     * - Provided → ONLY these phases exist; array order is execution order.
     */
    phases?: PhaseT[];
}

class FrameBroker<PhaseT extends string = DefaultPhase> {
    constructor(init: FrameBrokerInit<PhaseT>) { /* ... */ }
}
```

### Generic phase type `PhaseT`

`FrameBroker<PhaseT>` is parameterized by `PhaseT` — a string union of all
possible phases for this broker.

**`PhaseT` is provided explicitly at construction; it is not inferred from
`init.phases`.** The caller states the phase union up front:

```ts
type AppPhase = 'ingest' | 'parse' | 'process';
new FrameBroker<AppPhase>({ phases: ['ingest', 'parse', 'process'] });
```

Why explicit rather than inferred: providing the union as an explicit generic
forces TypeScript to **validate `init.phases` against it in the IDE**. A typo,
missing phase, or stray phase in the array is flagged right at the construction
site, making misconfiguration easy to see. Inference would silently widen (e.g.
to `string`) and lose that check.

`FrameBrokerInit<PhaseT>` is itself generic precisely so that `phases: PhaseT[]`
binds to the same union the broker was given — the init type and the broker type
share one `PhaseT`.

- Defaults to `DefaultPhase` (`'setup' | 'main' | 'cleanup'`), so
  `new FrameBroker({})` (no type arg) is typed as
  `FrameBroker<'setup' | 'main' | 'cleanup'>`.
- For custom phases, pass the union explicitly: `new FrameBroker<AppPhase>(...)`.

### `init.phases` — two roles

The `phases?: PhaseT[]` property serves two purposes:

1. **Execution order.** The array order determines the order phases execute in.
   (Order may later be governed by richer rules — see open questions — but for
   now position in the array *is* the order.)
2. **Validation set.** The phases are stored on the broker as a `Set<PhaseT>`
   and used by a validation helper to **reject any call that doesn't provide a
   valid `PhaseT`** argument.

If `init.phases` is omitted, the broker falls back to the default three phases
(`setup`, `main`, `cleanup`) for both roles.

> Phase ordering/validation is conceptually a [`FrameScheduler`](./scheduler.md)
> concern (see [scheduler → Phase](./scheduler.md#phase)); the broker owns the
> phase **set/config** at construction and supplies it to the scheduler.

## Per-frame time budget

The frame's time budget derives from the engine's target frame rate, scaled by
a root-level **budget percentage** — the fraction of each frame that budgeted
work may use:

```
budgetMs = (1000 / fps) * budgetPct
```

e.g. 60 FPS at 100% → ~16.67ms, 120 FPS at 100% → ~8.33ms; 60 FPS at 80% →
~13.33ms.

### Implemented surface

- **`init.fps?: number`** / **`init.budgetPct?: () => number`** — initial target
  FPS (default [`Defaults.Broker.Fps`](../../src/defaults.ts) = 60) and budget
  percentage (default `Defaults.Broker.BudgetPct` = 1, the full frame). An
  invalid `init.fps` falls back to the default rather than throwing.
- **`get fps(): number`** / **`get budgetMs(): number`** — current target FPS and
  derived budget. `budgetMs` re-evaluates the `budgetPct` function on **every
  read**, so a time-varying function changes the budget live; a value outside
  `[0, 1]` (or non-finite) is treated as the full frame.
- **`setFps(fps, budgetPct?): boolean`** — set the target FPS, optionally setting
  the percentage in the same call. Validates eagerly and is **rejected as a
  whole** (no partial mutation, returns `false`) if `fps` is not finite/`> 0`,
  or if a supplied `budgetPct`'s current value is not finite/within `[0, 1]`.
  Omitting `budgetPct` keeps the current percentage. Decimal FPS allowed.
- **`setBudgetPct(budgetPct): boolean`** — set the budget percentage
  independently of FPS; same `[0, 1]` validation and reject-on-invalid contract.

The budget **percentage** is a function (not a plain number) so callers can make
the fraction vary over time (e.g. throttle under load) without re-calling the
setter each frame.

> **Resolved.** The [`FrameExecutor`](./executor.md) **measures** consumption —
> it wraps each [`executeWorker`](./executor.md) call in `performance.now()`
> deltas and returns an aggregated [usage object](./executor.md#usage-object).
> `FrameBroker` supplies the per-frame budget value (`budgetMs`) and relays the
> measured usage to the scheduler. The executor only iterates and executes; the
> scheduler owns adaptation based on the returned measurements.

## Diagnostics channel — `onDiagnostic`

`FrameBrokerInit` accepts an **optional** `onDiagnostic` handler — a structured,
opt-in channel for the package to surface advisory warnings without `console`
spam (idiomatic for a drop-in lib). Silent by default; routable to the
consumer's own logging.

```ts
interface Diagnostic {
    code: string; // e.g. 'FIXED_MIN_HIGH'
    // ...code-specific structured fields (node id, observed vs configured, suggestion)
}
type OnDiagnostic = (d: Diagnostic) => void;
```

First concrete code is **`FIXED_MIN_HIGH`** — emitted by the
[`FrameScheduler`](./scheduler.md)'s adaptive logic when a node's `fixedMin` is
provably over-set (chronically above observed p95 usage). See
[adaptive-budget.md → over-set detection](../features/adaptive-budget.md#over-set-detection--fixed_min_high-diagnostic).
The broker owns the channel and relays diagnostics raised by the components it
brokers.

## Responsibilities

- Own the registry, scheduler, and executor (parent container); be the only
  component aware of the others.
- **Mediate** all inter-component interaction — the components never talk
  directly.
- Drive the per-frame cycle: get plan from scheduler → pass to executor →
  update scheduler with consumed time/results.
- Supply the per-frame time budget (derived from target FPS or set directly).

## Sole public entry point

`FrameBroker` is the package's **only** public-facing surface. The
[`FrameRegistry`](./registry.md), [`FrameScheduler`](./scheduler.md), and
[`FrameExecutor`](./executor.md) are **internal** — the broker owns them and is
the only thing that touches them. Consumers never hold a registry reference; they
register through the broker. Routing every consumer operation (worker
registration, phase registration, budget config) through the broker guarantees
any resulting state changes, schedule rebuilds, or housekeeping are **always
performed or queued as part of the call** (the broker funnels them through a
single private `onRegistryChanged()` seam), rather than leaving a component in a
state the broker doesn't know about.

### Worker registration → unsubscribe

The single methods are the **only** code paths; the bulk methods are thin
wrappers that iterate and call them, so validation and housekeeping happen
identically per worker (no duplicated logic).

- **`registerWorker(path, init, forceScheduleUpdate?): Unsubscribe`** — the
  singular add path. `init` is a **`WorkerInit`** descriptor
  `{name, fn, phase, config?}` (the registration *input* shape, distinct from the
  stored `Worker` node). Delegates to the internal registry (ensure-path),
  validates `init.phase` against the broker's phase set (**throws** on an unknown
  phase), then runs housekeeping. Returns an **`Unsubscribe`** (`() => boolean`)
  that removes the worker when invoked; **idempotent** (first call `true`, then
  `false`). The handle delegates to `unregisterWorker`. _(Implemented.)_
- **`registerWorkers(path, inits, forceScheduleUpdate?): Unsubscribe[]`** —
  register many workers under the **same owning `path`** in one call (phase still
  per-worker via each `init`). Wraps `registerWorker`; returns one handle per
  input, in order; `forceScheduleUpdate` is applied **once after the batch**. If
  an `init` has an unknown phase it throws on that item (earlier items stay
  registered). _(Implemented. Note: `inits` is an array param, not rest, so the
  trailing `forceScheduleUpdate` is expressible.)_
- **`unregisterWorker(path, name, phase): boolean`** — the singular removal path:
  registry delete (with **tombstone**, see below) + housekeeping if anything was
  removed. `true` if removed. _(Implemented.)_
- **`unregisterWorkers(...refs): boolean[]`** — remove many; `refs` are
  **`WorkerRef`** descriptors `{path, name, phase}`. Wraps `unregisterWorker`;
  one result per input, in order. _(Implemented.)_
- **`unregisterAll()`** — bulk teardown that tombstones and drops the entire
  tree. Lives on the **registry**; the broker calls it on shutdown. **Not exposed
  on the broker's public surface yet** (TBD — revisit with the lifecycle
  delegate). _(Registry: implemented.)_

### Mid-frame register / unregister timing

Registration mutates the registry **immediately**, but the schedule the executor
walks is a separate cached structure rebuilt lazily. The two directions are
asymmetric:

- **Register mid-frame** — the worker is added at once but is **not** in this
  frame's already-fetched schedule, so it naturally first runs **next** frame.
  `onRegistryChanged()` calls `scheduler.markDirty()`; the rebuild is deferred.
- **`forceScheduleUpdate`** — the rare escape hatch: when `true`, the broker
  calls `scheduler.rebuildIfDirty()` to rebuild **synchronously now** so the new
  worker runs **this** frame. Pays the sort cost immediately; reserve for cases
  that genuinely require same-frame execution.
- **Unregister mid-frame (tombstone)** — harder, because the removed worker may
  **still be present in this frame's live schedule**. A naive removal would let
  the executor invoke it after the caller unsubscribed — dangerous if the
  unsubscribe was tearing the worker's state down. So `unregister` **tombstones**
  the worker (`alive = false`) before deleting it; because the schedule
  references the same `Worker` objects, the [executor](./executor.md#tombstone-skip)
  checks `alive` and **skips** tombstoned workers. This guarantees an
  unsubscribed worker never runs again this frame and that a torn-down `fn` is
  never called — one boolean read per worker, no allocation.

> **Not in tension with [DEC-001](../decisions.md#dec-001--components-communicate-by-direct-calls--returns-not-events).**
> The unsubscribe handle and the lifecycle hooks below are **not** per-frame: a
> registration happens at setup, and lifecycle milestones fire **once** over the
> system's lifetime (see below). DEC-001 governs the **per-frame hot path** only;
> neither touches it.

### Phase registration

- **`addPhase(phase): boolean`** — append a phase to the **end** of the
  execution order. Phases are **permanent**: there is no removal counterpart, and
  re-adding an existing phase is a no-op (`false`). Allowed **only before the
  broker is running** — `addPhase` after [`start()`](#lifecycle-seam) **throws**,
  since the run loop iterates a fixed phase order. _(Implemented.)_
- **`get phases(): readonly PhaseT[]`** / **`isValidPhase(phase)`** — read-only
  view of the order and the validity check. _(Implemented.)_

### Lifecycle seam

- **`start(): void`** / **`get isRunning(): boolean`** — minimal running-state
  seam: `start()` locks the phase set and is idempotent. This is a placeholder
  for the full lifecycle (below). _(Implemented as a stub.)_

### Debug snapshots

Two **debug-only inspection** methods that return a **plain-data copy** of
current state — for printing, logging, or asserting in a test. Both are pure
copies: the returned value shares **no** references with live broker internals
(no `Map`s, no `Worker`/`fn` references), so inspecting or `JSON.stringify`ing it
cannot mutate state or invoke a worker. They delegate to the component each
mirrors.

> **Heavy — not for normal operation.** Each call walks and allocates a fresh
> copy of the relevant state. They are diagnostics tools; do **not** call them on
> the per-frame hot path (ideally not every frame at all). This keeps them clear
> of [DEC-001](../decisions.md#dec-001--components-communicate-by-direct-calls--returns-not-events)'s
> per-frame concern.

- **`registrySnapshot(): RegistrySnapshot`** — deep copy of the worker
  registration tree (delegates to [`registry.snapshot()`](./registry.md#internal-surface-broker-facing)).
  Each worker's live `fn` is reduced to a `hasFn` boolean. `undefined` when
  nothing is registered. _(Implemented.)_
- **`scheduleSnapshot(): ScheduleSnapshot`** — copy of the scheduler's current
  state (delegates to [`scheduler.snapshot()`](./scheduler.md#debug-snapshot)).
  **Partial today:** the built plan does not exist yet, so it reports only
  `built` (always `false`) / `dirty`, with a reserved `plan` stub (`undefined`)
  to be filled once the schedule shape is finalized. _(Implemented as a state-only
  stub.)_

## Lifecycle (`@toreda/lifecycle`)

> **Planned — not yet implemented.** The running-state seam above is the
> placeholder.

`FrameBroker` (and its child components) will implement a **`@toreda/lifecycle`**
delegate (likely **`ClientDelegate`**) to drive engine-style startup/shutdown.
Lifecycle methods are **multi-stage milestones invoked once per event over the
system's whole lifetime** — `clientWillInit` fires exactly once, never per frame
— which is precisely why they give natural, one-time points to set up frame
budgeting, build the initial schedule, and tear down.

Mapping onto the broker:

- **Startup milestones** (`clientWillInit` → `clientOnInit` → `clientDidInit`,
  loading/starting, …) — set up the registry/scheduler/executor wiring, build the
  initial schedule, and `start()` the broker. Each is the natural home for the
  corresponding one-time setup.
- **Once running**, no further setup milestones fire — only **pause** and
  **shutdown** events do. This is what makes locking the phase set on `start()`
  correct.
- **Shutdown** (`clientWillStop` / `clientWillShutdown`) — stop the broker and
  **unregister all workers** so nothing is retained after the host tears down
  (leak prevention). The registry's `unregister` / the unsubscribe handles are
  the mechanism.

Delegate shape (verified against `@toreda/lifecycle@2.2.1`): a delegate is a
**type alias** — `Partial<Record<ClientPhase, LifecycleListener>> &
LifecycleDelegateCommon` — so the broker provides a `lifecycle` instance, a
`reset()`, optional `children`, and any subset of the ~27 optional phase
listeners (`LifecycleListener = (args?) => boolean | Promise<boolean>`, async
supported). `children` are invoked recursively, mapping onto **broker →
child-component** fan-out (each child component implements the same delegate and
runs its slice of each milestone).

Open: whether `ClientDelegate` suffices or a custom delegate domain is warranted,
and exactly which subset of phases the broker vs. children implement.

## Intended public surface (draft)

> Phase + FPS/budget surface and the registration/phase API are implemented; the
> per-frame cycle and full lifecycle are not.

- Construct from a target FPS and budget percentage; owns the three components.
  _(Implemented: `init.fps` / `init.budgetPct`.)_
- Register work and get an unsubscribe handle: `registerWorker(path, init)` and
  bulk `registerWorkers(path, ...inits)`; remove via `unregisterWorker(...)` /
  `unregisterWorkers(...)`. _(Implemented.)_
- Grow the phase order: `addPhase` (permanent, pre-run only). _(Implemented.)_
- Adjust the budget at runtime: `setFps(fps, budgetPct?)` and `setBudgetPct`.
  _(Implemented.)_
- A per-frame tick/update entry point that runs the cycle above. _(TODO.)_
- Lifecycle startup/shutdown via a `@toreda/lifecycle` delegate. _(TODO; `start`
  / `isRunning` stub exists.)_
- Access to the budget value: `get fps` / `get budgetMs`. _(Implemented.)_
- Debug inspection: `registrySnapshot()` / `scheduleSnapshot()` return plain-data
  copies of current state (heavy, not per-frame). _(Implemented; schedule
  snapshot is a state-only stub until the plan shape lands.)_

## Relationship to other systems

- Owns and mediates all three components; they never communicate directly.
- Each frame: `scheduler.getSchedule()` → iterate phases calling
  `executor.executePhase(schedule, ctx, phaseWorkers)` → `scheduler.updateUsage(consumed)`
  with the executor's returned [usage object](./executor.md#usage-object).
- Owns the [`FrameRegistry`](./registry.md) as the passive store the scheduler
  reads during its build.

## Open questions

- Time source: `performance.now()` vs. caller-supplied timestamps (for
  determinism/testability)?
- Is one `FrameBroker` reused across frames (reset each frame) or created per
  frame?
- Safety margin: reserve part of the budget to avoid overrun from the last task
  started?
- How is overrun handled when a single task exceeds the whole budget?
- Who owns the frame loop — does `FrameBroker` hook `requestAnimationFrame`, or
  does the host engine call its tick each frame?
- End-user-facing public name (deferred).
</content>
