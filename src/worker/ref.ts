/**
 * A reference that uniquely addresses one registered worker for removal —
 * `(path, name, phase)`, mirroring how {@link WorkerInit} + its `path` address a
 * worker for registration. Shared by the broker's single and bulk unregister
 * methods.
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export interface WorkerRef<PhaseT extends string = string> {
	/** Node names from the tree root down to the worker's owning node. */
	path: readonly string[];

	/** Worker name/id. */
	name: string;

	/** The phase the worker is registered in. */
	phase: PhaseT;
}
