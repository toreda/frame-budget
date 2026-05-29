import {Defaults} from '../defaults.js';
import {type DefaultPhase, type FrameBrokerInit} from './broker/init.js';

/**
 * Top-level orchestrator and parent container. Owns the registry, scheduler,
 * and executor and brokers all interaction between them — they are fully
 * decoupled and never communicate directly.
 *
 * @typeParam PhaseT - String union of all phases for this broker. Provide it
 *   explicitly for custom phases (`new FrameBroker<AppPhase>(...)`) so the
 *   compiler validates `init.phases` against it. Defaults to
 *   {@link DefaultPhase} (`'setup' | 'main' | 'cleanup'`) when omitted.
 */
export class FrameBroker<PhaseT extends string = DefaultPhase> {
	/**
	 * Phases in execution order. Position in the array determines the order in
	 * which phases run.
	 */
	public readonly phases: readonly PhaseT[];

	/** Phase set used to validate phase arguments. Mirrors {@link phases}. */
	public readonly phaseSet: ReadonlySet<PhaseT>;

	/** Current target frames per second. Drives {@link budgetMs}. */
	private _fps: number;

	/**
	 * Root-level fraction `[0, 1]` of each frame that budgeted work may use,
	 * resolved fresh each time {@link budgetMs} is read so it can vary over
	 * time.
	 */
	private _budgetPct: () => number;

	constructor(init: FrameBrokerInit<PhaseT>) {
		const phases = init.phases ?? (Defaults.Broker.Phases as readonly string[] as readonly PhaseT[]);
		this.phases = phases.slice();
		this.phaseSet = new Set<PhaseT>(this.phases);

		const fps = init.fps ?? Defaults.Broker.Fps;
		// Fall back to the default rather than constructing an invalid broker.
		this._fps = FrameBroker.isValidFps(fps) ? fps : Defaults.Broker.Fps;
		this._budgetPct = init.budgetPct ?? (() => Defaults.Broker.BudgetPct);
	}

	/** Current target frames per second. */
	public get fps(): number {
		return this._fps;
	}

	/**
	 * Per-frame time budget in milliseconds: the full frame time (`1000 / fps`)
	 * scaled by the root-level budget percentage.
	 *
	 * The percentage function is evaluated on every read, so a caller-supplied
	 * function that varies over time changes the budget accordingly. Should it
	 * ever return a value outside `[0, 1]` (or a non-finite number), it is
	 * treated as the full frame ({@link Defaults.Broker.BudgetPct}).
	 *
	 * e.g. 60 FPS at 100% → ~16.67ms; 60 FPS at 80% → ~13.33ms.
	 */
	public get budgetMs(): number {
		const pct = this._budgetPct();
		const safePct = FrameBroker.isValidBudgetPct(pct) ? pct : Defaults.Broker.BudgetPct;
		return (1000 / this._fps) * safePct;
	}

	/**
	 * Set the target frames per second, which drives the per-frame time budget
	 * ({@link budgetMs}). The budget percentage may optionally be set in the
	 * same call.
	 *
	 * The call is **rejected as a whole** (no FPS or percentage change) if:
	 * - `fps` is not a finite number greater than `0`, or
	 * - `budgetPct` is provided but its current value is not a finite number
	 *   within `[0, 1]`.
	 *
	 * @param fps - Target frames per second. Must be a finite number `> 0`;
	 *   decimal values are allowed.
	 * @param budgetPct - Optional function returning the root-level fraction
	 *   `[0, 1]` of each frame that budgeted work may use. Evaluated once now to
	 *   validate, then again on every {@link budgetMs} read. Omitted: the
	 *   current percentage is kept.
	 * @returns `true` if the call was applied, `false` if it was rejected.
	 */
	public setFps(fps: number, budgetPct?: () => number): boolean {
		if (!FrameBroker.isValidFps(fps)) {
			return false;
		}

		// Validate the percentage before mutating anything so a bad value
		// rejects the entire call rather than half-applying it.
		if (budgetPct !== undefined && !FrameBroker.isValidBudgetPct(budgetPct())) {
			return false;
		}

		this._fps = fps;
		if (budgetPct !== undefined) {
			this._budgetPct = budgetPct;
		}
		return true;
	}

	/**
	 * Set the root-level budget percentage independently of the target FPS.
	 *
	 * @param budgetPct - Function returning the fraction `[0, 1]` of each frame
	 *   that budgeted work may use. Evaluated once now to validate, then again
	 *   on every {@link budgetMs} read.
	 * @returns `true` if the value was valid and applied, `false` otherwise
	 *   (the current percentage is left unchanged on rejection).
	 */
	public setBudgetPct(budgetPct: () => number): boolean {
		if (!FrameBroker.isValidBudgetPct(budgetPct())) {
			return false;
		}

		this._budgetPct = budgetPct;
		return true;
	}

	/** Whether `fps` is a usable target frame rate (finite and `> 0`). */
	private static isValidFps(fps: number): boolean {
		return typeof fps === 'number' && Number.isFinite(fps) && fps > 0;
	}

	/** Whether `pct` is a usable budget fraction (finite and within `[0, 1]`). */
	private static isValidBudgetPct(pct: number): boolean {
		return typeof pct === 'number' && Number.isFinite(pct) && pct >= 0 && pct <= 1;
	}

	/**
	 * Whether `phase` is a valid phase for this broker.
	 */
	public isValidPhase(phase: PhaseT): boolean {
		return this.phaseSet.has(phase);
	}
}
