/**
 * Plain, serializable **snapshot** of the scheduler's current state, for
 * debugging — printing it, asserting on it in a test, or `JSON.stringify`ing
 * it. Like the registry snapshot it is a copy made of plain data only: it shares
 * no object identity with the scheduler's internals.
 *
 * > **Partial today.** The scheduler's priority-ordered plan (`build()` /
 * > `getSchedule()`) is not implemented yet, so there is no built schedule to
 * > copy out — only the scheduler's observable dirty/built state. The
 * > {@link ScheduleSnapshot.plan} field is therefore reserved (`undefined`) and
 * > will carry the ordered phase → node → worker structure once the schedule
 * > shape lands. See `_specs/systems/scheduler.md` → schedule build.
 *
 * See {@link FrameScheduler.snapshot}.
 */
export interface ScheduleSnapshot {
	/**
	 * Whether a real schedule has been built yet. Always `false` today — the
	 * scheduler's `build()` is a no-op placeholder — and becomes `true` once the
	 * schedule shape is implemented and a plan has been built.
	 */
	built: boolean;

	/** Whether the cached schedule is currently stale (a rebuild is pending). */
	dirty: boolean;

	/**
	 * The built, priority-ordered plan the executor would walk.
	 *
	 * **Reserved / not yet populated.** `undefined` until the schedule shape is
	 * finalized; it will then hold the per-phase, priority-ordered
	 * node → worker structure as plain data (no live references). Typed `unknown`
	 * for now so the field can be added without committing to a shape that does
	 * not exist yet.
	 */
	plan: unknown;
}
