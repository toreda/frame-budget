import {FrameRegistry} from '../../src/frame/registry.js';

describe('FrameRegistry', () => {
	it('can be constructed', () => {
		expect(new FrameRegistry()).toBeInstanceOf(FrameRegistry);
	});

	// TODO: register/unregister, per-node config storage, and priority-ordered
	// iteration once the registry surface is implemented.
	// See _specs/systems/registry.md.
});
