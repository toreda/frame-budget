/**
 * Per-frame execution state shared across a single frame's executions.
 *
 * A `FrameContext` is created at the start of a frame, threaded through every
 * {@link FrameExecutor} call for that frame, and **released after the frame
 * ends**. The {@link FrameExecutor} itself is stateless — it never retains
 * state between method calls; all cross-execution state for the frame lives
 * here instead.
 *
 * The concrete fields settle as the executor/scheduler contract solidifies
 * (e.g. consumed time so far, completed workers, the active phase). For now the
 * interface marks the seam so executor signatures can take a `ctx` argument.
 */
export interface FrameContext {
	/**
	 * Wall-clock time consumed so far this frame, in milliseconds — the running
	 * sum of the per-worker `deltaTime` measurements the executor's parent takes
	 * around each {@link FrameExecutor.executeWorker} call.
	 */
	consumedMs: number;

	// TODO: further per-frame fields — completed worker ids, active phase, demand
	// signals. See _specs/systems/executor.md.
}
