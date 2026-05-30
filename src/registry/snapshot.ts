import {type RegistryNodeSnapshot} from './node/snapshot.js';

/**
 * Plain-data **snapshot** of the whole registry work tree for debugging: the
 * root node copy, or `undefined` when nothing has been registered yet
 * (mirroring {@link FrameRegistry.rootNode}).
 *
 * A deep copy made of plain data only — no `Map`s, no live function references,
 * no shared object identity with the registry — so a consumer can inspect,
 * `JSON.stringify`, or print the current registration tree without holding a
 * handle that could mutate registry state or invoke a worker. Producing one
 * walks the whole tree, so it is a debug/inspection tool, not something to call
 * on the per-frame hot path. See {@link FrameRegistry.snapshot}.
 */
export type RegistrySnapshot<PhaseT extends string = string> = RegistryNodeSnapshot<PhaseT> | undefined;
