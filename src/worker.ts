import {type NodeConfig} from './node/config.js';
import {type WorkerFn} from './worker/fn.js';

/**
 * A single named worker function, its phase, and its scheduling config.
 *
 * The **stored** node held in the registry tree (as opposed to the
 * {@link WorkerInit} registration *input*, which lacks the resolved `priority`
 * and `alive` flag). A worker carries its {@link phase} as a tag; the same
 * `(path, name)` may be registered in several phases, and that identical naming
 * is **deliberate** — it is the handle by which a later phase's worker reaches
 * the state an earlier phase's worker of the same id produced.
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export interface Worker<PhaseT extends string = string> extends NodeConfig {
	/**
	 * Worker name/id — the **same across phases**. Within one node a name may
	 * recur once per phase; the identical naming is intentional, letting a later
	 * phase's worker address the earlier phase's worker of the same id.
	 */
	name: string;

	/**
	 * The phase this worker runs in. Phases run in order, so a worker in a later
	 * phase is guaranteed to see state set up by earlier phases — the reason
	 * phases exist (a lightweight stand-in for an explicit dependency graph).
	 */
	phase: PhaseT;

	/** The frame-budgeted function this worker runs. */
	fn: WorkerFn;

	/**
	 * **Tombstone flag.** `true` while registered; set to `false` the instant the
	 * worker is unregistered. The cached schedule the executor walks references
	 * these same `Worker` objects, so a worker unsubscribed **mid-frame** is still
	 * present in this frame's plan — the executor MUST check `alive` and **skip**
	 * any worker where it is `false` before invoking `fn`. This guarantees an
	 * unsubscribed worker never runs again this frame and makes the
	 * unsubscribe-to-tear-down hazard moot: a disposed `fn` is never called.
	 *
	 * One boolean read per worker on the hot path — no allocation. See
	 * `_specs/systems/executor.md` → tombstone skip and
	 * `_specs/systems/registry.md` → mid-frame unregister.
	 */
	alive: boolean;
}
