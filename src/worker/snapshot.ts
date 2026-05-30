/**
 * Snapshot of a single registered {@link Worker}: its data fields copied out,
 * with the live `fn` reduced to a {@link hasFn} flag so the copy carries no
 * callable reference.
 *
 * Part of the registry's plain-data debug snapshot — a deep copy made of plain
 * data only (no `Map`s, no live function references, no shared object identity
 * with the registry), for inspecting / `JSON.stringify`ing / printing the
 * current registration tree without holding a handle that could mutate registry
 * state or invoke a worker. See {@link FrameRegistry.snapshot}.
 */
export interface WorkerSnapshot<PhaseT extends string = string> {
	/** Worker name/id. */
	name: string;

	/** The phase this worker runs in. */
	phase: PhaseT;

	/** Resolved scheduling priority. */
	priority: number;

	/** Tombstone flag — `true` while registered, `false` once unregistered. */
	alive: boolean;

	/**
	 * Whether the worker has a frame-budgeted function. Always `true` for a
	 * registered worker; surfaced as a boolean (rather than the function itself)
	 * so the snapshot stays pure data and leaks no callable reference.
	 */
	hasFn: boolean;
}
