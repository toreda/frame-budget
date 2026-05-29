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

/** Usage for a single worker — the leaf of the rollup. */
export type WorkerUsage = NodeUsage;

/** Usage for one system: its own totals plus a per-worker breakdown. */
export interface SystemUsage extends NodeUsage {
	/** Per-worker usage, keyed by worker name. */
	workers: Record<string, WorkerUsage>;
}

/** Usage for one category: its own totals plus a per-system breakdown. */
export interface CategoryUsage extends NodeUsage {
	/** Per-system usage, keyed by system name. */
	systems: Record<string, SystemUsage>;
}

/** Usage for one phase: its own totals plus a per-category breakdown. */
export interface PhaseUsage extends NodeUsage {
	/** Per-category usage, keyed by category name. */
	categories: Record<string, CategoryUsage>;
}
