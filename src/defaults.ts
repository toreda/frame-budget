/**
 * Package-wide default values.
 *
 * Defaults are grouped by the system they belong to. Each group is a
 * `static readonly` property whose members use `UpperCamelCase` to signify a
 * static global value, and the group object is declared `as const` so its
 * values are deeply readonly literal types.
 */
export class Defaults {
	/** Defaults for `FrameBroker`. */
	public static readonly Broker = {
		/**
		 * Phases used when `FrameBrokerInit.phases` is omitted.
		 * Execution order is `setup` → `main` → `cleanup`.
		 */
		Phases: ['setup', 'main', 'cleanup'],
		/**
		 * Target frames per second used when `FrameBrokerInit.fps` is omitted.
		 * Yields a per-frame budget of `1000 / 60` ≈ 16.67ms.
		 */
		Fps: 60,
		/**
		 * Root-level fraction `[0, 1]` of each frame that budgeted work may use
		 * when no `budgetPct` is supplied. `1` = the full frame time.
		 */
		BudgetPct: 1
	} as const;

	/** Defaults for the `FrameScheduler`. */
	public static readonly FrameScheduler = {
		/**
		 * Priority used when a registration omits `priority`. Unsigned int,
		 * higher = more important. `20` leaves ample room to drop below the
		 * baseline (down to `0`) for low-priority work and to raise above it.
		 * See `_specs/features/adaptive-budget.md` → Priority.
		 */
		Priority: 20
	} as const;
}
