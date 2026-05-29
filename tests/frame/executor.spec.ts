import {FrameExecutor} from '../../src/frame/executor.js';

describe('FrameExecutor', () => {
	it('can be constructed', () => {
		expect(new FrameExecutor()).toBeInstanceOf(FrameExecutor);
	});

	// TODO: priority-ordered execution within categories/systems/phases, and the
	// performance.now() delta measurement around executeWorker, once the executor
	// is implemented. See _specs/systems/executor.md.
});
