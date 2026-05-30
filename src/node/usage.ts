/**
 * Measured execution consumption for one node, aggregated bottom-up through the
 * taxonomy.
 *
 * The {@link FrameExecutor} produces these by wrapping each worker call in
 * `performance.now()` deltas and rolling the results up `worker → system →
 * category → phase`. The {@link FrameBroker} relays the phase-level rollup to
 * {@link FrameScheduler.updateUsage}, which drives adaptive budget allocation.
 */
export interface NodeUsage {
	/** Number of times this node's work was invoked this frame. */
	calls: number;

	/** Total wall-clock time consumed by this node this frame, in milliseconds. */
	consumedMs: number;
}
