import {FrameScheduler} from '../../src/frame/scheduler.js';

describe('FrameScheduler', () => {
	it('can be constructed', () => {
		expect(new FrameScheduler()).toBeInstanceOf(FrameScheduler);
	});

	// TODO: per-frame planning, priority/phase resolution, and the adaptive
	// two-pool allocation once the scheduler is implemented.
	// See _specs/systems/scheduler.md and _specs/features/adaptive-budget.md.
});
