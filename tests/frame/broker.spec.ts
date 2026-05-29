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
});
