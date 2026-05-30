import {FrameBroker} from '../../src/frame/broker.js';
import {Defaults} from '../../src/defaults.js';

describe('FrameBroker', () => {
	describe('target FPS & frame budget', () => {
		it('defaults fps to Defaults.Broker.Fps when init.fps is omitted', () => {
			const broker = new FrameBroker({});

			expect(broker.fps).toBe(Defaults.Broker.Fps);
		});

		it('derives the default budget as 1000 / default fps', () => {
			const broker = new FrameBroker({});

			expect(broker.budgetMs).toBeCloseTo(1000 / Defaults.Broker.Fps);
		});

		it('uses init.fps when provided', () => {
			const broker = new FrameBroker({fps: 120});

			expect(broker.fps).toBe(120);
			expect(broker.budgetMs).toBeCloseTo(1000 / 120);
		});

		it('falls back to the default fps when init.fps is invalid', () => {
			for (const bad of [0, -30, NaN, Infinity, -Infinity]) {
				const broker = new FrameBroker({fps: bad});

				expect(broker.fps).toBe(Defaults.Broker.Fps);
				expect(broker.budgetMs).toBeCloseTo(1000 / Defaults.Broker.Fps);
			}
		});
	});

	describe('budget percentage', () => {
		it('scales the budget by init.budgetPct', () => {
			const broker = new FrameBroker({fps: 60, budgetPct: () => 0.8});

			expect(broker.budgetMs).toBeCloseTo((1000 / 60) * 0.8);
		});

		it('re-evaluates the percentage function on every read', () => {
			let pct = 0.5;
			const broker = new FrameBroker({fps: 60, budgetPct: () => pct});

			expect(broker.budgetMs).toBeCloseTo((1000 / 60) * 0.5);
			pct = 0.25;
			expect(broker.budgetMs).toBeCloseTo((1000 / 60) * 0.25);
		});

		it('allows the full inclusive [0, 1] range, including 0', () => {
			const zero = new FrameBroker({fps: 60, budgetPct: () => 0});
			expect(zero.budgetMs).toBeCloseTo(0);

			const full = new FrameBroker({fps: 60, budgetPct: () => 1});
			expect(full.budgetMs).toBeCloseTo(1000 / 60);
		});

		it('treats an out-of-range percentage as the full frame', () => {
			for (const bad of [-0.5, 1.5, NaN, Infinity]) {
				const broker = new FrameBroker({fps: 60, budgetPct: () => bad});

				expect(broker.budgetMs).toBeCloseTo(1000 / 60);
			}
		});
	});

	describe('setBudgetPct', () => {
		it('sets the percentage independently of fps', () => {
			const broker = new FrameBroker({fps: 60});

			expect(broker.setBudgetPct(() => 0.5)).toBe(true);
			expect(broker.fps).toBe(60);
			expect(broker.budgetMs).toBeCloseTo((1000 / 60) * 0.5);
		});

		it('rejects an out-of-range percentage without mutating state', () => {
			const broker = new FrameBroker({fps: 60, budgetPct: () => 0.5});

			for (const bad of [-0.1, 1.1, NaN, Infinity]) {
				expect(broker.setBudgetPct(() => bad)).toBe(false);
				expect(broker.budgetMs).toBeCloseTo((1000 / 60) * 0.5);
			}
		});
	});

	describe('setFps', () => {
		it('updates fps and recomputes the budget', () => {
			const broker = new FrameBroker({fps: 60});

			expect(broker.setFps(30)).toBe(true);
			expect(broker.fps).toBe(30);
			expect(broker.budgetMs).toBeCloseTo(1000 / 30);
		});

		it('updates the budget percentage when supplied', () => {
			const broker = new FrameBroker({fps: 60});

			expect(broker.setFps(120, () => 0.5)).toBe(true);
			expect(broker.fps).toBe(120);
			expect(broker.budgetMs).toBeCloseTo((1000 / 120) * 0.5);
		});

		it('keeps the existing percentage when budgetPct is omitted', () => {
			const broker = new FrameBroker({fps: 60, budgetPct: () => 0.5});

			expect(broker.setFps(30)).toBe(true);
			expect(broker.budgetMs).toBeCloseTo((1000 / 30) * 0.5);
		});

		it('allows decimal fps values', () => {
			const broker = new FrameBroker({fps: 60});

			expect(broker.setFps(59.94)).toBe(true);
			expect(broker.fps).toBe(59.94);
			expect(broker.budgetMs).toBeCloseTo(1000 / 59.94);
		});

		it('rejects non-positive or non-finite fps without mutating state', () => {
			const broker = new FrameBroker({fps: 60});

			for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
				expect(broker.setFps(bad)).toBe(false);
				expect(broker.fps).toBe(60);
				expect(broker.budgetMs).toBeCloseTo(1000 / 60);
			}
		});

		it('rejects the entire call when budgetPct is out of range, leaving fps unchanged', () => {
			const broker = new FrameBroker({fps: 60, budgetPct: () => 0.5});

			expect(broker.setFps(120, () => 1.5)).toBe(false);
			expect(broker.fps).toBe(60);
			expect(broker.budgetMs).toBeCloseTo((1000 / 60) * 0.5);
		});
	});

	describe('worker registration', () => {
		const noop = (): boolean => false;

		it('registers a worker through the broker for a valid phase', () => {
			const broker = new FrameBroker({});

			expect(() =>
				broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main'})
			).not.toThrow();
		});

		it('throws when registering against an unknown phase', () => {
			const broker = new FrameBroker({});

			expect(() =>
				broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'nope' as 'main'})
			).toThrow(/unknown phase/);
		});

		it('returns an unsubscribe handle that removes the worker', () => {
			const broker = new FrameBroker({});
			const off = broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main'});

			expect(off()).toBe(true);
		});

		it('is idempotent: a second unsubscribe is a no-op', () => {
			const broker = new FrameBroker({});
			const off = broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main'});

			expect(off()).toBe(true);
			expect(off()).toBe(false);
		});

		it('unregisters a worker by (path, name, phase)', () => {
			const broker = new FrameBroker({});
			broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main'});

			expect(broker.unregisterWorker(['engine'], 'draw', 'main')).toBe(true);
			expect(broker.unregisterWorker(['engine'], 'draw', 'main')).toBe(false);
		});

		it('accepts forceScheduleUpdate without affecting the registration result', () => {
			const broker = new FrameBroker({});
			const off = broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main'}, true);

			expect(off()).toBe(true);
		});
	});

	describe('bulk worker registration', () => {
		const noop = (): boolean => false;

		it('registers many workers under one path and returns a handle each', () => {
			const broker = new FrameBroker({});
			const offs = broker.registerWorkers(
				['engine'],
				[
					{name: 'draw', fn: noop, phase: 'main'},
					{name: 'cull', fn: noop, phase: 'main'}
				]
			);

			expect(offs).toHaveLength(2);
			expect(offs.every((off) => off())).toBe(true);
		});

		it('honors each worker its own phase in a bulk call', () => {
			const broker = new FrameBroker({});

			expect(() =>
				broker.registerWorkers(
					['engine'],
					[
						{name: 'draw', fn: noop, phase: 'main'},
						{name: 'teardown', fn: noop, phase: 'cleanup'}
					]
				)
			).not.toThrow();
			expect(broker.unregisterWorker(['engine'], 'teardown', 'cleanup')).toBe(true);
		});

		it('unregisters many workers and returns a result each, in order', () => {
			const broker = new FrameBroker({});
			broker.registerWorkers(
				['engine'],
				[
					{name: 'draw', fn: noop, phase: 'main'},
					{name: 'cull', fn: noop, phase: 'main'}
				]
			);

			const results = broker.unregisterWorkers(
				{path: ['engine'], name: 'draw', phase: 'main'},
				{path: ['engine'], name: 'missing', phase: 'main'}
			);

			expect(results).toEqual([true, false]);
		});

		it('accepts a forced bulk registration', () => {
			const broker = new FrameBroker({});
			const offs = broker.registerWorkers(
				['engine'],
				[
					{name: 'draw', fn: noop, phase: 'main'},
					{name: 'cull', fn: noop, phase: 'main'}
				],
				true
			);

			expect(offs).toHaveLength(2);
		});
	});

	describe('phase registration', () => {
		it('starts with the default phases', () => {
			const broker = new FrameBroker({});

			expect(broker.phases).toEqual(['setup', 'main', 'cleanup']);
		});

		it('appends a new phase to the end of the order', () => {
			const broker = new FrameBroker<'setup' | 'main' | 'cleanup' | 'late'>({
				phases: ['setup', 'main', 'cleanup']
			});

			expect(broker.addPhase('late')).toBe(true);
			expect(broker.phases).toEqual(['setup', 'main', 'cleanup', 'late']);
			expect(broker.isValidPhase('late')).toBe(true);
		});

		it('treats re-adding an existing phase as a no-op', () => {
			const broker = new FrameBroker({});

			expect(broker.addPhase('main')).toBe(false);
			expect(broker.phases).toEqual(['setup', 'main', 'cleanup']);
		});

		it('rejects adding a phase once the broker is running', () => {
			const broker = new FrameBroker<'setup' | 'main' | 'cleanup' | 'late'>({
				phases: ['setup', 'main', 'cleanup']
			});
			broker.start();

			expect(broker.isRunning).toBe(true);
			expect(() => broker.addPhase('late')).toThrow(/after the broker is running/);
		});

		it('lets a worker register against a phase added after construction', () => {
			const broker = new FrameBroker<'setup' | 'main' | 'cleanup' | 'late'>({
				phases: ['setup', 'main', 'cleanup']
			});
			broker.addPhase('late');

			expect(() =>
				broker.registerWorker([], {name: 'cleanupTask', fn: () => false, phase: 'late'})
			).not.toThrow();
		});
	});

	describe('debug snapshots', () => {
		const noop = (): boolean => false;

		it('registrySnapshot is undefined before anything is registered', () => {
			const broker = new FrameBroker({});

			expect(broker.registrySnapshot()).toBeUndefined();
		});

		it('registrySnapshot reflects registered workers as plain data', () => {
			const broker = new FrameBroker({});
			broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main', config: {priority: 7}});

			const snap = broker.registrySnapshot()!;
			expect(snap.children[0].name).toBe('engine');
			expect(snap.children[0].workers[0]).toEqual({
				name: 'draw',
				phase: 'main',
				priority: 7,
				alive: true,
				hasFn: true
			});
		});

		it('registrySnapshot is a copy that does not affect broker state when mutated', () => {
			const broker = new FrameBroker({});
			broker.registerWorker(['engine'], {name: 'draw', fn: noop, phase: 'main'});

			broker.registrySnapshot()!.children[0].workers.pop();

			// A fresh snapshot still has the worker — the prior copy was independent.
			expect(broker.registrySnapshot()!.children[0].workers).toHaveLength(1);
		});

		it('scheduleSnapshot reports the unbuilt, dirty stub for a fresh broker', () => {
			const broker = new FrameBroker({});

			expect(broker.scheduleSnapshot()).toEqual({built: false, dirty: true, plan: undefined});
		});
	});
});
