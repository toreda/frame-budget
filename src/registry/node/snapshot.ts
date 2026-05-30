import {type WorkerSnapshot} from '../../worker/snapshot.js';

/**
 * Snapshot of one {@link RegistryNode}: its config plus its workers and children
 * as plain arrays (the live `Map`s flattened to ordered lists, in `Map`
 * iteration order).
 *
 * Part of the registry's plain-data debug snapshot — a deep copy sharing no
 * object identity with the live tree. See {@link FrameRegistry.snapshot}.
 */
export interface RegistryNodeSnapshot<PhaseT extends string = string> {
	/** Node name. */
	name: string;

	/** Node-level scheduling priority. */
	priority: number;

	/** Workers that run directly at this node. */
	workers: WorkerSnapshot<PhaseT>[];

	/** Child nodes forming deeper structure. */
	children: RegistryNodeSnapshot<PhaseT>[];
}
