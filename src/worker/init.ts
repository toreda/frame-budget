import {type NodeConfigInit} from '../node/config/init.js';
import {type WorkerFn} from './fn.js';

/**
 * Registration **input** for one worker — the descriptor a caller supplies, as
 * opposed to the stored {@link Worker} node (which also carries a resolved
 * `priority`). Shared by the broker's single and bulk register methods so they
 * are one code path. The owning node's `path` is supplied separately (one `path`
 * per bulk call, since all workers in a `registerWorkers(path, …)` call share
 * the same owning node).
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export interface WorkerInit<PhaseT extends string = string> {
	/** Worker name/id (the same across phases). */
	name: string;

	/** The frame-budgeted function this worker runs. */
	fn: WorkerFn;

	/** The phase this worker runs in. */
	phase: PhaseT;

	/** Optional per-worker scheduling config; unset fields default. */
	config?: NodeConfigInit;
}
