import {type PhaseUsage} from './usage.js';

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
	 * ordering work happens; invoked lazily by {@link getSchedule} on change.
	 */
	private build(): void {
		throw new Error('FrameScheduler.build not implemented');
	}
}
