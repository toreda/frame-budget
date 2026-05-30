import {Defaults} from '../defaults.js';

/**
 * Default phases used when {@link FrameBrokerInit.phases} is not provided.
 * Derived from the default value {@link Defaults.Broker.Phases} so the type and
 * value never drift. Execution order is `setup` → `main` → `cleanup`.
 */
export type DefaultPhase = (typeof Defaults.Broker.Phases)[number];
