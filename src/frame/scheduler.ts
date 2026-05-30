import {type PhaseUsage} from '../phase/usage.js';
import {type ScheduleSnapshot} from '../schedule/snapshot.js';

/**
 * Per-frame planning engine. Resolves execution order from each node's priority
 * and phase (reading the {@link FrameRegistry}) and maintains a cached,
 * priority-ordered schedule that the {@link FrameExecutor} walks.
 *
 * Communicates **only** with the {@link FrameBroker}, via two methods called
 * once per frame:
 *
 * - {@link getSchedule} — hand the broker the current plan (rebuilt internally
 *   only on change, never every frame).
 * - {@link updateUsage} — accept the executor's measured consumption so the
 *   adaptive allocation can step.
 */
export class FrameScheduler {
	/**
	 * Whether the cached schedule is stale and must be rebuilt before next use.
	 * Starts `true` (nothing has been built yet). Set by {@link markDirty} when
	 * the registry or config changes; cleared by {@link rebuildIfDirty}.
	 */
	private _dirty = true;

	/** Whether a rebuild is pending (the cached schedule is stale). */
	public get isDirty(): boolean {
		return this._dirty;
	}

	/**
	 * Mark the cached schedule stale so the next {@link getSchedule} (or a forced
	 * {@link rebuildIfDirty}) rebuilds it. Called by the {@link FrameBroker} after
	 * a registry change (register/unregister). Cheap and allocation-free — it only
	 * flips a flag; the expensive rebuild is deferred.
	 */
	public markDirty(): void {
		this._dirty = true;
	}

	/**
	 * Rebuild the schedule **now** if it is dirty, then clear the flag. This is
	 * the **force** path: the broker calls it when a caller requested
	 * `forceScheduleUpdate` so a just-registered worker can run in the *same*
	 * frame, rather than waiting for the next frame's {@link getSchedule}.
	 *
	 * Synchronous by design — it pays the sort cost immediately, which is why
	 * forcing is reserved for rare cases (the normal path amortizes rebuilds).
	 *
	 * @returns `true` if a rebuild ran, `false` if the schedule was already clean.
	 */
	public rebuildIfDirty(): boolean {
		if (!this._dirty) {
			return false;
		}
		this.build();
		this._dirty = false;
		return true;
	}

	/**
	 * Return the current schedule for the broker to execute this frame.
	 *
	 * Internally (re)builds the priority-ordered structure **only when something
	 * changed** — registration/unregistration, config/priority edits, or usage
	 * statistics that shifted enough to matter — otherwise returns the cached
	 * plan. Sorting/priority resolution happens here, never during execution.
	 */
	public getSchedule(): unknown {
		throw new Error('FrameScheduler.getSchedule not implemented');
	}

	/**
	 * Produce a plain-data **snapshot** of the scheduler's current state for
	 * debugging — printing it or asserting on it in a test. The result is a copy:
	 * it shares no object identity with the scheduler's internals, so it is safe
	 * to inspect or `JSON.stringify` without touching live scheduling state. Not
	 * intended for execution.
	 *
	 * **Partial today.** The priority-ordered plan does not exist yet
	 * ({@link build} is a no-op placeholder), so only the observable `built` /
	 * `dirty` state is reported and {@link ScheduleSnapshot.plan} is reserved
	 * (`undefined`). When the schedule shape lands, this fills in the ordered
	 * phase → node → worker structure as plain data (no live references). See
	 * `_specs/systems/scheduler.md` → schedule build.
	 */
	public snapshot(): ScheduleSnapshot {
		return {
			// No real plan is ever built yet — build() is a placeholder no-op.
			built: false,
			dirty: this._dirty,
			plan: undefined
		};
	}

	/**
	 * Feed back the executor's measured consumption (relayed by the broker) so the
	 * adaptive stepping and usage statistics can update.
	 *
	 * May batch and actually recompute only every `n` frames — rebuilding the
	 * schedule is the expensive operation to amortize.
	 *
	 * @param consumed - Per-phase usage rollups measured by the executor this
	 *   frame.
	 */
	public updateUsage(consumed: PhaseUsage[]): void {
		void consumed;
		throw new Error('FrameScheduler.updateUsage not implemented');
	}

	/**
	 * Rebuild the priority-ordered schedule from the registry. The only place
	 * ordering work happens; invoked by {@link rebuildIfDirty} (and lazily by
	 * {@link getSchedule}) on change.
	 *
	 * TODO: not yet implemented — the actual priority/phase sorting lands with the
	 * schedule shape. Kept as a safe no-op (rather than throwing) so the
	 * dirty/force plumbing around it works today. See
	 * `_specs/systems/scheduler.md` → schedule build.
	 */
	private build(): void {
		// no-op placeholder; see TODO above
	}
}
