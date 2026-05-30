import {Defaults} from '../defaults.js';
import {type NodeConfigInit} from '../node/config/init.js';
import {type RegistryNode} from '../registry/node.js';
import {type RegistryNodeSnapshot} from '../registry/node/snapshot.js';
import {type RegistrySnapshot} from '../registry/snapshot.js';
import {type Worker} from '../worker.js';
import {type WorkerFn} from '../worker/fn.js';
import {type WorkerSnapshot} from '../worker/snapshot.js';

/**
 * Public entry point and passive store of all frame-budgeted work.
 *
 * Work is held as a single **arbitrary-depth tree** of {@link RegistryNode}s —
 * each node carries a priority and owns both workers and child nodes — rather
 * than a fixed `category → system → worker` taxonomy. Consumers impose whatever
 * depth and grouping suits them; only the nodes needed to hold a registered
 * worker are created.
 *
 * The tree is **shared across phases**. Phase is a per-worker tag, not a
 * partition of the tree: a worker registered at `['engine','renderer']` carries
 * its phase, and the same `(path, name)` may be registered in several phases.
 * That identical naming is deliberate — phases run in order, so a later phase's
 * worker can rely on (and verify) the state an earlier phase's worker of the
 * same id produced. The node spine is created once regardless of how many phases
 * register through it.
 *
 * The registry does not decide who runs each frame: the {@link FrameScheduler}
 * reads the tree at schedule build, buckets workers by phase, and resolves
 * execution order; the {@link FrameExecutor} walks the resulting plan. See
 * `_specs/systems/registry.md`.
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export class FrameRegistry<PhaseT extends string = string> {
	/** Root of the shared work tree; created lazily on first registration. */
	private root: RegistryNode<PhaseT> | undefined;

	/**
	 * Register a worker, auto-creating any missing nodes along `path` — the same
	 * way writing to a subfolder ensures the path exists first. Intermediate
	 * nodes are created with default config; existing nodes are reused (their
	 * config left untouched).
	 *
	 * An empty `path` registers the worker directly on the root. Re-registering
	 * the same `(path, worker, phase)` **replaces** the prior worker (its
	 * function and config); registering the same `(path, worker)` in a *different*
	 * phase adds a distinct worker alongside it.
	 *
	 * @param path - Names of the nodes from the root down to the worker's owning
	 *   node (e.g. `['engine','renderer']`). Empty registers at the root.
	 * @param worker - Worker name/id, the same across phases.
	 * @param fn - The worker's frame-budgeted function (`() => boolean`).
	 * @param phase - The phase the worker runs in.
	 * @param config - Optional per-worker scheduling config; unset fields default.
	 * @returns The registered (or replaced) {@link Worker}.
	 */
	public register(
		path: readonly string[],
		worker: string,
		fn: WorkerFn,
		phase: PhaseT,
		config?: NodeConfigInit
	): Worker<PhaseT> {
		const owner = this.ensurePath(path);

		const workerNode: Worker<PhaseT> = {
			name: worker,
			phase,
			fn,
			priority: config?.priority ?? Defaults.FrameScheduler.Priority,
			alive: true
		};
		owner.workers.set(FrameRegistry.workerKey(worker, phase), workerNode);
		return workerNode;
	}

	/**
	 * Remove a worker by `(path, worker, phase)`. **Tombstones** the worker first
	 * (`alive = false`) so a copy still sitting in the frame's cached schedule is
	 * skipped by the executor mid-walk, then deletes it from the tree. Intermediate
	 * nodes are left in place (they may hold other workers / subtrees); pruning
	 * empty nodes is a separate concern.
	 *
	 * @returns `true` if a worker was removed, `false` if none matched.
	 */
	public unregister(path: readonly string[], worker: string, phase: PhaseT): boolean {
		const owner = this.node(path);
		if (owner === undefined) {
			return false;
		}
		const key = FrameRegistry.workerKey(worker, phase);
		const workerNode = owner.workers.get(key);
		if (workerNode === undefined) {
			return false;
		}
		// Tombstone before delete: the schedule references this same object, so
		// flipping `alive` makes the executor skip it even this frame.
		workerNode.alive = false;
		owner.workers.delete(key);
		return true;
	}

	/**
	 * Remove **all** registered work, discarding the entire tree. Primarily for
	 * teardown (e.g. on broker shutdown) to drop every worker reference and avoid
	 * leaks. After this the registry is empty; {@link rootNode} returns
	 * `undefined` until something is registered again.
	 *
	 * Every worker is **tombstoned** (`alive = false`) on the way out so any copy
	 * still referenced by an in-flight schedule is skipped by the executor — the
	 * same mid-frame guarantee as {@link unregister}, applied wholesale. This is
	 * what makes shutdown teardown safe even if a frame is mid-walk.
	 */
	public unregisterAll(): void {
		if (this.root !== undefined) {
			FrameRegistry.tombstoneSubtree(this.root);
		}
		this.root = undefined;
	}

	/** Tombstone every worker in `node` and its descendants (depth-first). */
	private static tombstoneSubtree<PhaseT extends string>(node: RegistryNode<PhaseT>): void {
		for (const worker of node.workers.values()) {
			worker.alive = false;
		}
		for (const child of node.children.values()) {
			FrameRegistry.tombstoneSubtree(child);
		}
	}

	/** The root of the work tree, or `undefined` if nothing is registered yet. */
	public rootNode(): RegistryNode<PhaseT> | undefined {
		return this.root;
	}

	/**
	 * Produce a deep, plain-data **snapshot** of the entire work tree for
	 * debugging — printing it, asserting on values in a test, or `JSON.stringify`
	 * ing it. The result is a **full copy**: it shares no object identity with the
	 * live tree (no `Map`s, no `Worker` references), so mutating it cannot affect
	 * the registry, and each worker's live `fn` is reduced to a `hasFn` boolean so
	 * the copy carries no callable reference.
	 *
	 * Not for execution — it walks the whole tree and allocates, so it is an
	 * inspection tool, never a per-frame call. Returns `undefined` when nothing is
	 * registered yet (mirroring {@link rootNode}).
	 */
	public snapshot(): RegistrySnapshot<PhaseT> {
		if (this.root === undefined) {
			return undefined;
		}
		return FrameRegistry.snapshotNode(this.root);
	}

	/** Deep-copy one node (and its descendants) into a plain {@link RegistryNodeSnapshot}. */
	private static snapshotNode<PhaseT extends string>(
		node: RegistryNode<PhaseT>
	): RegistryNodeSnapshot<PhaseT> {
		const workers: WorkerSnapshot<PhaseT>[] = [];
		for (const worker of node.workers.values()) {
			workers.push({
				name: worker.name,
				phase: worker.phase,
				priority: worker.priority,
				alive: worker.alive,
				hasFn: typeof worker.fn === 'function'
			});
		}

		const children: RegistryNodeSnapshot<PhaseT>[] = [];
		for (const child of node.children.values()) {
			children.push(FrameRegistry.snapshotNode(child));
		}

		return {
			name: node.name,
			priority: node.priority,
			workers,
			children
		};
	}

	/**
	 * Resolve the node at `path`, or `undefined` if any segment is not
	 * registered. Empty `path` returns the root.
	 */
	public node(path: readonly string[]): RegistryNode<PhaseT> | undefined {
		let node = this.root;
		for (const name of path) {
			if (node === undefined) {
				return undefined;
			}
			node = node.children.get(name);
		}
		return node;
	}

	/**
	 * Resolve a worker by `(path, worker, phase)`, or `undefined` if its owning
	 * node or the worker itself is not registered.
	 */
	public worker(path: readonly string[], worker: string, phase: PhaseT): Worker<PhaseT> | undefined {
		return this.node(path)?.workers.get(FrameRegistry.workerKey(worker, phase));
	}

	/**
	 * Walk `path` from the root, creating the root and any missing intermediate
	 * nodes with default config (ensure-path semantics), and return the node the
	 * path addresses.
	 */
	private ensurePath(path: readonly string[]): RegistryNode<PhaseT> {
		let node = this.root;
		if (node === undefined) {
			node = FrameRegistry.makeNode<PhaseT>('');
			this.root = node;
		}

		for (const name of path) {
			let child: RegistryNode<PhaseT> | undefined = node.children.get(name);
			if (child === undefined) {
				child = FrameRegistry.makeNode<PhaseT>(name);
				node.children.set(name, child);
			}
			node = child;
		}
		return node;
	}

	/**
	 * Compose the internal `workers` map key from a worker name and phase. Phase
	 * namespaces the name so the same id can live in multiple phases on one node.
	 * The `\u0000` separator cannot appear in a normal identifier, so it never
	 * collides with a name that legitimately contains the phase string.
	 */
	private static workerKey(worker: string, phase: string): string {
		return `${worker}\u0000${phase}`;
	}

	/** Create an empty node with default config. */
	private static makeNode<PhaseT extends string>(name: string): RegistryNode<PhaseT> {
		return {
			name,
			priority: Defaults.FrameScheduler.Priority,
			workers: new Map<string, Worker<PhaseT>>(),
			children: new Map<string, RegistryNode<PhaseT>>()
		};
	}
}
