# Design Decisions

> Project-level **decision log**. Records cross-cutting architectural choices —
> the ones that span multiple systems or would otherwise be invisible in any
> single spec. Each entry states the context, the decision, and the trade-off
> accepted, so a later reader (or a reconsideration) starts from the original
> reasoning rather than reverse-engineering it.
>
> System-local decisions stay in that system's spec; only choices that touch the
> whole package belong here. Append new entries at the end and keep them dated.

## DEC-001 — Components communicate by direct calls + returns, not events

**Status:** accepted (2026-05-29)

**Context.** The four systems are intentionally decoupled — they never talk to
each other directly; the [`FrameBroker`](./systems/broker.md) mediates every
interaction (get the schedule, run a phase, feed usage back). An obvious
alternative for that mediation is an **event/message bus**: components emit and
subscribe instead of the broker calling a method and consuming its return value.

Events would arguably be **cleaner and simpler** — looser coupling, no explicit
wiring of who-calls-what, easy to add observers. On its own merits it is an
attractive shape.

**Decision.** The broker uses **direct method calls and return values**
(`scheduler.getSchedule()`, `executor.executePhase(...)` returning a
[usage object](./systems/executor.md#usage-object),
`scheduler.updateUsage(consumed)`) — **not** an event bus — for all per-frame
interaction between components.

**Why — per-frame overhead is the overriding constraint.** This package is
**injected into an existing host system** and runs inside its frame loop. Every
cycle it spends is a cycle taken from potentially heavy host work happening in
the same frame; per-frame operations are extremely sensitive to disruption and
overhead, and the package's whole reason for existing is to *reduce* frame
disruption, not add to it. An event-driven design tends to allocate — event
objects, listener closures, queued payloads — on the hot path, raising **GC
pressure and heap size**. Even small per-frame allocations accumulate into GC
pauses that show up as exactly the frame hitches we exist to prevent. Direct
calls returning already-shaped data keep the hot path allocation-light and the
control flow straight-line.

**Consequences.**

- _Accepted cost:_ tighter, more explicit wiring in the broker (it must know the
  method surface of each component) and less out-of-the-box extensibility than a
  bus would give. Observers/diagnostics are handled by the narrow, opt-in
  [`onDiagnostic`](./systems/broker.md#diagnostics-channel--ondiagnostic) channel
  rather than general event subscription.
- _Benefit:_ minimal per-frame allocation and overhead; predictable, low-GC hot
  path suitable for injection into a latency-sensitive host loop.
- _Revisit if:_ a future need for many independent observers outweighs the
  per-frame cost, **and** it can be satisfied off the hot path (e.g. batched
  outside the frame loop) without reintroducing per-frame allocation.
