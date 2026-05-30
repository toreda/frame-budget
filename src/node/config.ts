/**
 * Scheduling config carried by every node and every worker. The registry only
 * **stores** these; the {@link FrameScheduler} interprets them. The full
 * adaptive-budget meaning of each field is specified in
 * `_specs/features/adaptive-budget.md`.
 */
export interface NodeConfig {
	/**
	 * Unsigned int; higher = more important. Orders a node (or worker) against
	 * its siblings; ties break alphabetically by name. Defaults to
	 * `Defaults.FrameScheduler.Priority` when a registration omits it.
	 */
	priority: number;
}
