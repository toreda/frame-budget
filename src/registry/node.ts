import {type NodeConfig} from '../node/config.js';
import {type Worker} from '../worker.js';

/**
 * One node in the registry's **arbitrary-depth** work tree. A node owns both:
 *
 * - **workers** — leaf functions that run directly at this node, across phases,
 *   and
 * - **children** — nested {@link RegistryNode}s forming deeper structure.
 *
 * The registry imposes no fixed `category → system → worker` taxonomy: each
 * level is a uniform node carrying a priority, its own workers, and any number
 * of child nodes. A node exists only because something (a worker, or a
 * descendant holding a worker) was registered under it; the registry creates
 * intermediate nodes lazily along a registration path.
 *
 * There is **one shared tree**, not one per phase — only the leaf workers are
 * phase-tagged (see {@link Worker.phase}) — so a node's spine is created once
 * regardless of how many phases register through it. The
 * {@link FrameScheduler} buckets workers by phase when building each frame's
 * schedule; the {@link FrameExecutor} walks the result.
 *
 * > **Open (TBD):** execution order of a node's own workers vs. its child
 * > groups. Running this node's workers first fits the priority model — the
 * > node has a priority and its workers run in priority order — but this is not
 * > yet settled.
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export interface RegistryNode<PhaseT extends string = string> extends NodeConfig {
	/** Node name — unique within its parent (or among the root's children). */
	name: string;

	/**
	 * Workers that run directly at this node. Keyed by `(name, phase)` so the
	 * same worker id can be registered in more than one phase on this node; use
	 * the registry's lookup helpers rather than indexing this map directly.
	 */
	workers: Map<string, Worker<PhaseT>>;

	/** Child nodes forming deeper structure, keyed by child name. */
	children: Map<string, RegistryNode<PhaseT>>;
}
