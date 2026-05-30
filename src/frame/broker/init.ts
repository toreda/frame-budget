import {type DefaultPhase} from '../../default/phase.js';

/**
 * Required and optional properties for constructing a {@link FrameBroker}.
 *
 * @typeParam PhaseT - String union of all phases for the broker. Defaults to
 *   {@link DefaultPhase} when `phases` is omitted.
 */
export interface FrameBrokerInit<PhaseT extends string = DefaultPhase> {
	/**
	 * Phases in execution order.
	 *
	 * - Omitted: defaults to {@link Defaults.Broker.Phases}
	 *   (`['setup', 'main', 'cleanup']`).
	 * - Provided: ONLY these phases exist; array order is the execution order.
	 *
	 * The phases are stored on the broker as a `Set<PhaseT>` and used to
	 * validate any call that takes a phase argument.
	 */
	phases?: PhaseT[];

	/**
	 * Target frames per second. Determines the initial per-frame time budget
	 * (`budgetMs = (1000 / fps) * budgetPct`). Must be a finite number greater
	 * than `0`.
	 *
	 * Omitted: defaults to {@link Defaults.Broker.Fps}. May be changed after
	 * construction via {@link FrameBroker.setFps}.
	 */
	fps?: number;

	/**
	 * Root-level budget percentage: a function returning the fraction `[0, 1]`
	 * of each frame that budgeted work may use. Evaluated lazily on every
	 * `budgetMs` read, so it may vary over time.
	 *
	 * Omitted: defaults to {@link Defaults.Broker.BudgetPct} (the full frame).
	 * May be changed after construction via {@link FrameBroker.setFps}.
	 */
	budgetPct?: () => number;
}
