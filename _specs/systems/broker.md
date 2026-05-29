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

### Per-frame cycle

Each frame, `FrameBroker`:

1. **Get planned work** from the [`FrameScheduler`](./scheduler.md).
2. **Pass that work to the [`FrameExecutor`](./executor.md)** to be done.
3. **Call update on the scheduler** with the results — time consumed, what
   completed, etc. — so the scheduler can update its plan for next time.

(The [`FrameRegistry`](./registry.md) is likewise owned and updated by
`FrameBroker`; how its `onUpdate` slots into the cycle is an open question.)

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

> **Open:** which component *tracks remaining ms* as work runs is not finalized.
> Since the [`FrameExecutor`](./executor.md) is the only component that actually does
> work (and thus spends time), tracking may belong there; `FrameBroker` supplies
> the per-frame budget value (`budgetMs`). See open questions.

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

## Intended public surface (draft)

> Phase + FPS/budget surface is implemented (see
> [Per-frame time budget](#per-frame-time-budget)); the per-frame cycle is not.

- Construct from a target FPS and budget percentage; owns the three components.
  _(Implemented: `init.fps` / `init.budgetPct`.)_
- Adjust the budget at runtime: `setFps(fps, budgetPct?)` and `setBudgetPct`.
  _(Implemented.)_
- A per-frame tick/update entry point that runs the cycle above. _(TODO.)_
- Access to the budget value: `get fps` / `get budgetMs`. _(Implemented;
  remaining-ms tracking still an open question on ownership.)_

## Relationship to other systems

- Owns and mediates all three components; they never communicate directly.
- Pulls the plan from [`FrameScheduler`](./scheduler.md), hands it to the
  [`FrameExecutor`](./executor.md), then reports results back to the scheduler.
- Owns and updates the [`FrameRegistry`](./registry.md).

## Open questions

- How does the registry's `onUpdate` slot into the per-frame cycle relative to
  the scheduler/executor steps?
- Which component **tracks remaining time** as work runs (executor vs.
  `FrameBroker` vs. a separate value)?
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
