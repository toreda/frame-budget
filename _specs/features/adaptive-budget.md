# Feature: Adaptive Budget Allocation

> Status: **design** — captures the intended model agreed during design. No
> source yet. This feature spans the [`FrameRegistry`](../systems/registry.md)
> (registration/config), the [`FrameScheduler`](../systems/scheduler.md) (where all
> allocation + adaptation logic lives), and the [`FrameBroker`](../systems/broker.md)
> (frame budget + diagnostics channel).

## Why this feature exists

`frame-budget` is meant to be a **generalized, drop-in** package — decoupled from
the host project's structure. That decoupling creates a problem: the package has
no insight into the latency-sensitive calls it must budget. Two consequences
drive the whole design:

1. **Registration is by callback.** Work registers a function, not
   project-coupled code (see [Worker contract](#worker-contract)). The package
   measures each call with `performance.now()` deltas to learn per-worker,
   per-system, per-category, and per-phase durations.

2. **Static per-node ms limits waste budget.** A hard "8ms for setup" reserves
   8ms whether or not setup runs — and reserved budget is budget no one else can
   use. Some projects never use a given phase; others use it heavily. So budgets
   must be **adaptive**: measured usage drives allocation, scaling busy work up
   and idle work down, reacting when usage changes.

The hard problem adaptation must solve without starving anyone:

> A task that runs rarely (e.g. a cron-like job every few minutes) decays toward
> 0 budget. When it finally runs it is resource-starved, runs long, and may not
> finish — potentially stuck. Decay-to-0 is only safe if such a task can **always
> still run**.

The **two-pool model** below is the answer: a task can always draw from a shared
pool even when its dedicated floor has decayed to 0, and the act of leaning on
the shared pool is itself the signal that regrows its dedicated floor.

## Worker contract

**Bounded chunk per call.** A worker is a callback that does a small, bounded
unit of work and returns whether more remains:

```ts
type Worker = () => boolean; // true = more work remains, false = done
```

The broker/executor calls it repeatedly within the remaining budget; each call
is wrapped in `performance.now()` deltas to measure duration. The boolean return
is both the "keep going?" signal **and** the demand signal for adaptation (see
[Demand signal](#demand-signal--ratcheting-the-floor-up)).

> This resolves the registry/executor open question on the worker invocation
> contract. Generator and deadline-passed-in variants were considered and
> rejected in favor of the simplest measurable unit.

## Units

Everything is **normalized to a fraction of the frame budget, `[0, 1]`**, and
resolved to ms at runtime against [`FrameBroker.budgetMs`](../systems/broker.md#per-frame-time-budget).
Normalized values are portable across FPS changes — `0.05` is 5% of the frame
whether at 60 or 120 FPS. (`fixedMin` additionally accepts an absolute-ms form;
see [Fixed floor](#fixedmin--the-non-adaptive-artifact-protection-floor).)

## Priority

`priority` is how a consumer ensures specific functions get the allocation they
require. Set optionally at registration; defaults to
[`Defaults.FrameScheduler.Priority`](../../src/defaults.ts) (**20**) when omitted.

- **Unsigned integer, higher = more important.** Kept unsigned (≥ 0) on purpose:
  the shared-pool split is `priority / Σ priority`, and negative or zero-sum
  weights would make that ill-defined. Unsigned keeps every weighting/ordering
  rule divide-safe with no special-casing.
- **Default `20`** leaves ample room to drop *below* the baseline (down to `0`)
  for low-priority work, and to raise above it for elevated work.
- **Carried at every taxonomy level.** Categories and systems have a `priority`
  too, not just workers — each level's iteration is ordered by it.
- **Alphabetical tie-break.** Equal priorities break by node **name**
  (ascending). Consequence: if nothing sets `priority`, every node sits at the
  default `20` and execution order is purely **alphabetical** — a deterministic,
  predictable baseline a consumer overrides only where order actually matters.

`priority` drives three things, all consistent under "higher = more important":

1. **Walk order (who resolves first).** Resolving budget portions walks
   contenders in **descending priority** (name-ascending on ties) — the most
   important resolve first, claiming budget while the pool is fullest.
   (Conceptually "sort and walk"; top-down so important work is served first.
   The sort is paid once at [schedule build](../systems/scheduler.md#schedule-build),
   never during execution.)
2. **Shared-pool weight** — proportional surplus via `priority / Σ priority`
   (see [two-pool model](#the-two-pool-model)).
3. **Overflow shedding** — highest-priority `fixedMin` guarantees are honored
   first when the total is infeasible (see
   [overflow](#overflow-honor-by-priority-shed-the-rest)).

### Reactive rebuild

Priority resolution is **not** recomputed from scratch every frame. The scheduler
estimates a **priority-ordered budget plan** and **caches** it, rebuilding only
when something that affects it changes — registration/unregistration, a
priority/config edit, or the adaptive usage statistics shifting enough to matter.
The structural plan is rebuilt on change; spending against it (re-resolving who
gets what of the *remaining* budget) happens per frame. This is the same
reactive principle as the rest of the scheduler — see
[scheduler → Reactive](../systems/scheduler.md#reactive).

## The two-pool model

Each frame's budget is divided into two conceptual pools:

1. **Dedicated pool** — per-registration guaranteed allocation. A node's
   dedicated allocation lives in the range `[fixedMin, max]` and is driven by
   the adaptive floor `adaptiveMin` (below). Unused dedicated budget **decays
   toward `fixedMin`** (default `0`) — "don't reserve what you don't use."

2. **Shared pool** — `budgetMs − Σ(dedicated actually used)`. Any task may draw
   from it, but a single task's draw per frame is **capped, priority-weighted**:

   ```
   taskSharedCap = sharedPool * (node.priority / Σ priority of this frame's contenders)
   ```

   Only nodes actually contending **this frame** count toward `Σ priority`. The
   cap prevents one task from draining the shared pool and ties shared access to
   the [`priority`](#priority) field. Because priority is **unsigned** (≥ 0), the
   split is always well-defined; a node at exactly `0` takes no *proportional*
   share of the surplus but still runs via its floor and walk-order claim.

**Why two pools solves the starvation edge case:**

- Idle task → `adaptiveMin` decays toward `fixedMin` (often 0). Not wasting
  reservation.
- It fires again with a near-0 floor → it **still runs**, from the shared pool
  (capped per frame).
- Each frame it leans on the shared cap (demand exceeds what it got), its
  `adaptiveMin` **ratchets up** (below). Over a few frames it climbs out of
  starvation via shared budget, then earns a dedicated floor.
- When it goes idle again, the floor decays back down.

The dedicated floor is the **slow, conservative, permanent** commitment; the
shared pool is the **fast, revocable loan** that covers demand *while* the floor
catches up. The user does not feel the convergence because the loan fills the
gap.

## The allocation range: `fixedMin` ≤ `adaptiveMin` ≤ `max`

One uniform model per node — there is **no special "hard-minimum node" type**.
Every node is fully adaptive; the only per-node difference is where its adaptive
floor bottoms out.

| Field | Adaptive? | Meaning |
| --- | --- | --- |
| `fixedMin` | No (set by user) | Non-adaptive hard floor. Doesn't decay. Bottom of the range. Default `0`. % or ms. |
| `adaptiveMin` | Yes (earned) | Live earned floor. Steps **up** under demand, decays **down** toward `fixedMin` (never below) when idle. |
| `max` | Yes (default) / No (if configured) | Ceiling. Dynamic trailing-headroom by default; stepped if `stepUpMax`/`stepDownMax` are set. |

```
alloc ∈ [fixedMin, max]
adaptiveMin rides between fixedMin and max
above fixedMin, everything is earned/released adaptively
```

The fixed/adaptive split is legible in the names: `fixedMin` vs `adaptiveMin`
are the same axis. (The system-wide word is **adaptive**; "dynamic" is reserved
for the specific [dynamic max](#dynamic-max--trailing-headroom) mechanism so the
two don't blur.)

### Adaptive stepping — dynamic, shared-gated

The floor walks in **steps** rather than reactive jumps. Reactive jumps have two
user-visible costs: they require *hitting* a limit to learn (so the task is
throttled during the very frames it signals need), and a jump like
`20% → 60%` either overshoots (re-wasting reservation) or needs many throttled
frames to converge. Stepping commits guaranteed budget only as fast as justified
while the shared pool absorbs the transient.

Per-registration knobs (all optional; defaults apply when unset):

- **`stepUpMin` / `stepDownMin`** — govern how `adaptiveMin` moves up / down.
- **`stepUpMax` / `stepDownMax`** — govern how `max` moves. **Unset by default**
  → `max` is dynamic (see below).

**Step size is dynamic, gated on shared availability.** `stepUpMin` is a
**maximum** step magnitude, not a fixed increment:

```
upStep = min(stepUpMin, freeShared * k)
```

- Lots of free shared budget → big steps (committing is cheap, low risk).
- Tight shared budget → small steps (committing is expensive; others need it).

This matches the goal: *quickly* grow the dedicated floor when there's spare
shared budget to justify it, crawl when contended.

**Asymmetric by design (anti-thrash):** up-steps respond to proven demand
quickly; `stepDownMin` decay is slow. Bursty work provisions fast but releases
gently, avoiding oscillation.

### Dynamic max — trailing headroom

When `stepUpMax`/`stepDownMax` are **unset**, `max` is not a fixed wall — it
**floats above the current floor by a headroom margin**:

```
effectiveMax = adaptiveMin + headroom
```

The ceiling rises *with* proven need instead of sitting at 100%, so `max` stays
meaningful even unconfigured (still gated by the shared cap + contention). When
`stepUpMax`/`stepDownMax` **are** set, `max` steps under those rules instead.

### Demand signal — ratcheting the floor up

The signal that raises `adaptiveMin` is **demand the shared pool could not fully
satisfy**: the worker returned `true` (more work remained) at the moment its
shared cap ran out for the frame. That is a truer signal than "used 100% of the
cap" (which could merely mean the task finished exactly at the cap). The
`() => boolean` contract provides this directly.

## `fixedMin` — the non-adaptive artifact-protection floor

Adaptation is **structurally lagging**: it reacts to the last *n* frames, so
there are always *n* frames of suboptimal budget before it corrects. For most
work this is imperceptible (≈5 frames ≈ 83ms @ 60 FPS). But some work has a hard
floor below which the user sees artifacts (e.g. render-adjacent work that must
run ≥X every frame or it stutters/tears). For those, "converge over 5 frames" is
5 frames of artifacts — unacceptable.

`fixedMin` is the escape hatch: a **non-adaptive, non-decaying** floor honored
from frame 1, settable as **percentage** (`[0,1]`, scales with FPS) or
**absolute ms** (fixed wall-clock, does **not** scale with FPS).

It composes with adaptation rather than replacing it — `adaptiveMin` simply
decays toward `fixedMin` instead of toward 0. The artifact-sensitive node still
climbs well above `fixedMin` when busy and settles back *to* `fixedMin` (not 0)
when idle. Best of both: never below X, never over-reserved above X.

### ms `fixedMin` bypasses parent caps

An ms `fixedMin` is honored **even if it exceeds its parent system/category's
normalized cap** — it is a leaf-level hard floor that ignores the hierarchy.
This is maximally powerful (the intended power of the ms form) and maximally able
to break the "parent contains children" invariant. The only thing that reins it
in is the runtime overflow policy below.

### Overflow: honor by priority, shed the rest

A consumer can declare `fixedMin` values (especially in ms) whose total exceeds
the frame budget — an **infeasible** state that cannot all run in one frame.
Policy:

> Fill `fixedMin` guarantees in **priority order** until the frame is full.
> Lower-priority guarantees that don't fit are **not** honored this frame
> (deferred). **The frame budget is never overrun** — preventing frame overrun
> is the entire purpose of the package, so even the hard floor yields to it.

**Consequence to document loudly:** because ms `fixedMin` is unrestricted at
declaration and arbitrated only at runtime by priority, a *high-priority*
oversized guarantee can shed *other* nodes' guarantees — including their artifact
protection — before it sheds itself. **Priority is the de-facto arbiter of whose
artifacts matter most under contention.** This is deliberate (one clear knob to
resolve the only truly infeasible case), but it is a sharp tool.

> The word is **`fixed`**, not "guaranteed": given the priority-shed policy the
> value is *not* strictly guaranteed (it can be shed under genuine
> over-subscription). `fixed` accurately means "non-adaptive," which is exactly
> and only what the field does. The `fixed*` name also namespaces a future
> `fixedMax`.

### Over-set detection — `FIXED_MIN_HIGH` diagnostic

Because the adaptive cap already scales up on demand, the correct usage is to set
`fixedMin` to the **lowest** value that prevents artifacts and let adaptation
cover spikes. A user who sets it high "to be safe" defeats the two-pool model —
re-introducing permanent over-reservation and shrinking everyone's shared pool.
It is allowed (the user's call) but is almost always a mistake from not realizing
adaptation handles the spikes — so the system **surfaces** it.

- **Trigger (runtime, data-driven):** once the lookback window holds enough
  samples, if `fixedMin > p95(usedMs)` over the window, the reservation is
  provably wasted → emit a warning carrying the observed p95 and a suggested
  lower floor.
- **Channel (opt-in diagnostics callback):** the library emits **structured**
  warnings to a consumer-registered handler (e.g. `onDiagnostic(w)` on
  [`FrameBrokerInit`](../systems/broker.md#construction--framebrokerinit)),
  `w` shaped like
  `{code: 'FIXED_MIN_HIGH', node, configuredMs, observedP95Ms, suggestedMs}`.
  Silent by default (no `console` spam), routable to the consumer's own logging —
  idiomatic for a drop-in lib. `onDiagnostic` is the **general** diagnostics
  channel; `FIXED_MIN_HIGH` is its first concrete code.

## Lookback window — usage statistics

How far back the scheduler retains per-task execution-duration history that feeds
adaptive allocation. The tension:

- **Short (e.g. 2s)** — responsive, but a tiny sample is noisy/inaccurate.
- **Long (e.g. 3600s)** — stable, but **smooths away bursts**: a 5s spike inside
  an hour barely moves the aggregate, so adaptation under-reacts to exactly the
  bursts it should catch.

**Decay-weighted window (recent counts more).** Samples are weighted by age
(e.g. `weight(age) = e^(-age/τ)`), so a *long* horizon stays burst-sensitive
because recent activity dominates the statistic — resolving the "long window
goes blind to bursts" problem without trading away stability. The window
**length** sets the retention horizon; the **decay rate `τ`** sets how sharply
recent dominates.

- **Bounds:** default **30s**, min **1s**, max **600s**. At 60 FPS the 30s
  default is ~1800 samples — ample for a stable p95 (so `FIXED_MIN_HIGH` has
  enough data) while still responsive.
- **Scope/units:** **global default in seconds, per-node override.** One
  scheduler-wide `lookbackSec` (FPS-independent); individual registrations may
  override (`lookbackSec?`) — a bursty node can run a shorter window than the
  calm baseline.

## Three distinct timescales (one home: the `FrameScheduler`)

All time-scheduling and adaptive logic lives in the [`FrameScheduler`](../systems/scheduler.md)
— that is what the dedicated class is for. But three **loops** at different rates
must stay conceptually distinct inside it:

| Loop | Timescale | Knob(s) |
| --- | --- | --- |
| Per-frame planning (who-goes-next) | ~1 frame | `priority`, phase |
| Adaptive stepping (floor up/down) | ~frames (≈5) | `stepUpMin`/`stepDownMin`, shared-gated by `k` |
| Usage statistics (lookback) | seconds (1–600, default 30) | `lookbackSec`, decay-weighted `τ` |

The lookback loop computes the *statistic* (typical usage, p95); the stepping
loop governs *how fast* allocation chases that statistic; the per-frame loop
spends the resolved budgets. Sharing one class must not blur the rates.

## Per-registration config (draft shape)

> Field names settle with the [registry](../systems/registry.md) `register()`
> API spec. Conceptual fields introduced by this feature:

| Field | Unit | Default | Role |
| --- | --- | --- | --- |
| `priority` | unsigned int | `20` | Higher = more important. Descending walk order + shared-pool weight + overflow shed order. See [Priority](#priority). |
| `fixedMin` | % `[0,1]` **or** ms | `0` | Non-adaptive hard floor. ms bypasses parent caps. |
| `stepUpMin` / `stepDownMin` | % `[0,1]` | default | Max up/down step for `adaptiveMin` (up is shared-gated). |
| `stepUpMax` / `stepDownMax` | % `[0,1]` | unset → dynamic `max` | Step for `max`; unset = trailing-headroom dynamic max. |
| `lookbackSec` | seconds | global default (30) | Per-node override of the usage window. |

## Open questions

- **`k` (shared-gating step constant)** and **`headroom`** defaults — global vs
  per-node? Ballpark values?
- **Decay rate `τ`** — derive automatically from `lookbackSec`, or expose as a
  separate knob?
- **Per-phase vs. whole-frame pools** — do the dedicated/shared pools operate
  within each phase (phases drain in order, so the shared pool would be
  per-phase) or across the whole frame regardless of phase?
- **Bootstrapping a new registration** — does `adaptiveMin` start at `fixedMin`
  and climb via the shared pool, or is there a configurable starter floor to
  avoid the first-use climb?
- **Cold-start cost** — the first invocation after long idle may be expensive
  (cold caches, large backlog) even with the shared pool; is anything special
  needed, or does the ratchet handle it over subsequent frames?
- **Default step sizes / decay rates** — concrete numbers for `stepUpMin`,
  `stepDownMin`, and the `adaptiveMin` decay.
- **Detection-at-registration** — an early `Σ(fixedMin) > budget` oversubscription
  warning was considered and deferred (runtime priority-shed is the chosen
  arbitration); revisit as a possible additional `onDiagnostic` code.
