import {Defaults} from '../../src/defaults.js';
import {FrameRegistry} from '../../src/frame/registry.js';

describe('FrameRegistry', () => {
	const noop = (): boolean => false;

	it('can be constructed', () => {
		expect(new FrameRegistry()).toBeInstanceOf(FrameRegistry);
	});

	describe('register (ensure-path)', () => {
		it('auto-creates the missing nodes along the path', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');

			expect(registry.node(['engine'])).toBeDefined();
			expect(registry.node(['engine', 'renderer'])).toBeDefined();
			expect(registry.worker(['engine', 'renderer'], 'draw', 'main')).toBeDefined();
		});

		it('only creates the hierarchy needed to hold the worker', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');

			expect([...(registry.rootNode()?.children.keys() ?? [])]).toEqual(['engine']);
			expect([...registry.node(['engine'])!.children.keys()]).toEqual(['renderer']);
		});

		it('nests the worker under the node addressed by the path', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');

			const renderer = registry.node(['engine', 'renderer']);
			expect(renderer?.name).toBe('renderer');
			expect(registry.worker(['engine', 'renderer'], 'draw', 'main')?.name).toBe('draw');
		});

		it('returns the registered worker with its fn and phase', () => {
			const registry = new FrameRegistry();
			const node = registry.register(['engine', 'renderer'], 'draw', noop, 'main');

			expect(node.name).toBe('draw');
			expect(node.phase).toBe('main');
			expect(node.fn).toBe(noop);
		});

		it('registers a worker directly on the root for an empty path', () => {
			const registry = new FrameRegistry();
			registry.register([], 'tick', noop, 'main');

			expect(registry.worker([], 'tick', 'main')?.fn).toBe(noop);
		});

		it('reuses existing nodes across registrations on the same path', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');
			const engineBefore = registry.node(['engine']);
			const rendererBefore = registry.node(['engine', 'renderer']);

			registry.register(['engine', 'renderer'], 'cull', noop, 'main');

			expect(registry.node(['engine'])).toBe(engineBefore);
			expect(registry.node(['engine', 'renderer'])).toBe(rendererBefore);
		});

		it('reuses a shared prefix but branches for a divergent path', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');
			const engineBefore = registry.node(['engine']);

			registry.register(['engine', 'physics'], 'step', noop, 'main');

			expect(registry.node(['engine'])).toBe(engineBefore);
			expect(engineBefore?.children.size).toBe(2);
			expect(registry.node(['engine', 'physics'])).toBeDefined();
		});
	});

	describe('phase is a per-worker tag on a shared tree', () => {
		it('shares the node spine across phases instead of duplicating it', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');
			const rendererMain = registry.node(['engine', 'renderer']);

			registry.register(['engine', 'renderer'], 'cull', noop, 'cleanup');

			// Same node object — the tree was not duplicated for the new phase.
			expect(registry.node(['engine', 'renderer'])).toBe(rendererMain);
		});

		it('keeps the same worker id in different phases as distinct workers', () => {
			const registry = new FrameRegistry();
			const a = (): boolean => true;
			const b = (): boolean => false;
			registry.register(['engine', 'renderer'], 'draw', a, 'main');
			registry.register(['engine', 'renderer'], 'draw', b, 'cleanup');

			expect(registry.worker(['engine', 'renderer'], 'draw', 'main')?.fn).toBe(a);
			expect(registry.worker(['engine', 'renderer'], 'draw', 'cleanup')?.fn).toBe(b);
			expect(registry.node(['engine', 'renderer'])?.workers.size).toBe(2);
		});
	});

	describe('config', () => {
		it('defaults node and worker priority to the scheduler default', () => {
			const registry = new FrameRegistry();
			const node = registry.register(['engine'], 'draw', noop, 'main');

			expect(node.priority).toBe(Defaults.FrameScheduler.Priority);
			expect(registry.node(['engine'])?.priority).toBe(Defaults.FrameScheduler.Priority);
		});

		it('honors a supplied worker priority', () => {
			const registry = new FrameRegistry();
			const node = registry.register(['engine'], 'draw', noop, 'main', {priority: 99});

			expect(node.priority).toBe(99);
		});
	});

	describe('tombstone on unregister (mid-frame safety)', () => {
		it('registers a worker alive', () => {
			const registry = new FrameRegistry();
			const w = registry.register(['engine'], 'draw', noop, 'main');

			expect(w.alive).toBe(true);
		});

		it('tombstones the worker object on unregister, even though it leaves the map', () => {
			const registry = new FrameRegistry();
			// Hold the reference a schedule would hold.
			const w = registry.register(['engine'], 'draw', noop, 'main');

			expect(registry.unregister(['engine'], 'draw', 'main')).toBe(true);
			expect(w.alive).toBe(false);
			expect(registry.worker(['engine'], 'draw', 'main')).toBeUndefined();
		});

		it('tombstones every worker in the tree on unregisterAll', () => {
			const registry = new FrameRegistry();
			const a = registry.register(['engine', 'renderer'], 'draw', noop, 'main');
			const b = registry.register(['physics'], 'step', noop, 'main');

			registry.unregisterAll();

			expect(a.alive).toBe(false);
			expect(b.alive).toBe(false);
		});
	});

	describe('replacement and lookups', () => {
		it('replaces a worker re-registered at the same address and phase', () => {
			const registry = new FrameRegistry();
			const first = (): boolean => true;
			const second = (): boolean => false;
			registry.register(['engine'], 'draw', first, 'main');
			registry.register(['engine'], 'draw', second, 'main');

			expect(registry.worker(['engine'], 'draw', 'main')?.fn).toBe(second);
			expect(registry.node(['engine'])?.workers.size).toBe(1);
		});

		it('returns undefined before anything is registered', () => {
			const registry = new FrameRegistry();
			expect(registry.rootNode()).toBeUndefined();
			expect(registry.node(['engine'])).toBeUndefined();
		});

		it('unregisterAll drops the whole tree', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');
			registry.register(['physics'], 'step', noop, 'main');

			registry.unregisterAll();

			expect(registry.rootNode()).toBeUndefined();
			expect(registry.node(['engine'])).toBeUndefined();
			expect(registry.worker(['physics'], 'step', 'main')).toBeUndefined();
		});

		it('returns undefined for an unregistered path, worker, or phase', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main');

			expect(registry.node(['engine', 'missing'])).toBeUndefined();
			expect(registry.worker(['engine', 'renderer'], 'missing', 'main')).toBeUndefined();
			expect(registry.worker(['engine', 'renderer'], 'draw', 'cleanup')).toBeUndefined();
		});
	});

	describe('snapshot (debug copy)', () => {
		it('returns undefined before anything is registered', () => {
			const registry = new FrameRegistry();

			expect(registry.snapshot()).toBeUndefined();
		});

		it('copies the tree as plain data with workers and children', () => {
			const registry = new FrameRegistry();
			registry.register(['engine', 'renderer'], 'draw', noop, 'main', {priority: 50});

			expect(registry.snapshot()).toEqual({
				name: '',
				priority: Defaults.FrameScheduler.Priority,
				workers: [],
				children: [
					{
						name: 'engine',
						priority: Defaults.FrameScheduler.Priority,
						workers: [],
						children: [
							{
								name: 'renderer',
								priority: Defaults.FrameScheduler.Priority,
								workers: [
									{
										name: 'draw',
										phase: 'main',
										priority: 50,
										alive: true,
										hasFn: true
									}
								],
								children: []
							}
						]
					}
				]
			});
		});

		it('reduces the live fn to a hasFn boolean (no callable reference)', () => {
			const registry = new FrameRegistry();
			registry.register([], 'tick', noop, 'main');

			const snap = registry.snapshot()!;
			expect(snap.workers[0].hasFn).toBe(true);
			expect(snap.workers[0]).not.toHaveProperty('fn');
		});

		it('shares no object identity with the live tree', () => {
			const registry = new FrameRegistry();
			registry.register(['engine'], 'draw', noop, 'main');

			const snap = registry.snapshot()!;
			// Mutating the copy must not touch the registry.
			snap.children[0].priority = 999;
			snap.children[0].workers[0].alive = false;

			expect(registry.node(['engine'])?.priority).toBe(Defaults.FrameScheduler.Priority);
			expect(registry.worker(['engine'], 'draw', 'main')?.alive).toBe(true);
		});

		it('is JSON-serializable', () => {
			const registry = new FrameRegistry();
			registry.register(['engine'], 'draw', noop, 'main');

			expect(() => JSON.stringify(registry.snapshot())).not.toThrow();
		});

		it('reflects a tombstoned-then-removed worker as gone', () => {
			const registry = new FrameRegistry();
			registry.register(['engine'], 'draw', noop, 'main');
			registry.unregister(['engine'], 'draw', 'main');

			expect(registry.snapshot()?.children[0].workers).toEqual([]);
		});
	});

	// TODO: priority-ordered iteration and unregister once those surfaces land.
	// See _specs/systems/registry.md.
});
