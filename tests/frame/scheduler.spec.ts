import {FrameScheduler} from '../../src/frame/scheduler.js';

describe('FrameScheduler', () => {
	it('can be constructed', () => {
		expect(new FrameScheduler()).toBeInstanceOf(FrameScheduler);
	});

	describe('dirty / rebuild plumbing', () => {
		it('starts dirty (nothing built yet)', () => {
			expect(new FrameScheduler().isDirty).toBe(true);
		});

		it('rebuildIfDirty clears the flag and reports it rebuilt', () => {
			const scheduler = new FrameScheduler();

			expect(scheduler.rebuildIfDirty()).toBe(true);
			expect(scheduler.isDirty).toBe(false);
		});

		it('rebuildIfDirty is a no-op when already clean', () => {
			const scheduler = new FrameScheduler();
			scheduler.rebuildIfDirty();

			expect(scheduler.rebuildIfDirty()).toBe(false);
			expect(scheduler.isDirty).toBe(false);
		});

		it('markDirty re-stales a clean schedule', () => {
			const scheduler = new FrameScheduler();
			scheduler.rebuildIfDirty();

			scheduler.markDirty();
			expect(scheduler.isDirty).toBe(true);
		});
	});

	describe('snapshot (debug copy)', () => {
		it('reports the current dirty state and an unbuilt, plan-less stub', () => {
			const scheduler = new FrameScheduler();

			expect(scheduler.snapshot()).toEqual({built: false, dirty: true, plan: undefined});
		});

		it('tracks the dirty flag', () => {
			const scheduler = new FrameScheduler();
			scheduler.rebuildIfDirty();

			expect(scheduler.snapshot().dirty).toBe(false);
		});
	});

	// TODO: per-frame planning, priority/phase resolution, and the adaptive
	// two-pool allocation once the scheduler is implemented.
	// See _specs/systems/scheduler.md and _specs/features/adaptive-budget.md.
});
