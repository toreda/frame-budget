import {type FrameContext} from './context.js';

/**
 * Performs the **stateless execution** of registered worker functions for a
 * single frame. A child of {@link FrameBroker}.
 *
 * `FrameExecutor` holds **no state of its own** across method calls — every
 * piece of cross-execution state for the frame lives in the {@link FrameContext}
 * (`ctx`) passed into each method. `ctx` is created at frame start and released
 * once the frame ends, so the executor instance is freely reusable frame to
 * frame.
 *
 * ## What it executes
 *
 * Execution is organized by the registry taxonomy `category → system → worker`,
 * cross-cut by **phase**. Each `execute*` method takes the frame's time
 * `budget` (ms), the per-frame `ctx`, and the group of things to execute, and
 * enforces **priority-ordered execution within the group**:
 *
 * - {@link executeCategory} — run a category (its systems, in priority order).
 * - {@link executeSystem} — run a system (its workers, in priority order).
 * - {@link executePhase} — run all workers assigned to one phase, in priority
 *   order.
 * - {@link executeWorker} — run a single worker function. Called by a parent in
 *   the hierarchy, which wraps the call in `performance.now()` deltas to measure
 *   the worker's actual execution time (`deltaTime`).
 *
 * ## Why phases (vs. priority alone)
 *
 * Some workers depend on other workers having run and updated state first.
 * Expressed across the whole system this becomes a dependency graph that is
 * costly to resolve and reconcile against priority every frame. Priority
 * ordering is deterministic but **not fixed** — priorities can change — so
 * leaning on it for ordering guarantees is fragile and must be carefully
 * managed.
 *
 * **Phases** sidestep that: execution is split into an arbitrary set of ordered
 * phases, and workers are assigned to a phase. Ordering by priority *within*
 * each phase each frame is far cheaper than resolving a dependency graph, while
 * still guaranteeing cross-phase order (everything in phase N runs before
 * phase N+1).
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export class FrameExecutor<PhaseT extends string = string> {
	/**
	 * Execute a category: run its systems in priority order within `budget`.
	 *
	 * @param budget - Time budget for this execution, in milliseconds.
	 * @param ctx - Per-frame execution context (created at frame start, released
	 *   at frame end).
	 * @param category - The category to execute. Type settles with the registry
	 *   taxonomy.
	 */
	public executeCategory(budget: number, ctx: FrameContext, category: unknown): void {
		void budget;
		void ctx;
		void category;
		throw new Error('FrameExecutor.executeCategory not implemented');
	}

	/**
	 * Execute a system: run its workers in priority order within `budget`.
	 *
	 * @param budget - Time budget for this execution, in milliseconds.
	 * @param ctx - Per-frame execution context.
	 * @param system - The system to execute. Type settles with the registry
	 *   taxonomy.
	 */
	public executeSystem(budget: number, ctx: FrameContext, system: unknown): void {
		void budget;
		void ctx;
		void system;
		throw new Error('FrameExecutor.executeSystem not implemented');
	}

	/**
	 * Execute a single phase: run all workers assigned to it, in priority order,
	 * within `budget`.
	 *
	 * @param budget - Time budget for this execution, in milliseconds.
	 * @param ctx - Per-frame execution context.
	 * @param phase - The phase to execute.
	 */
	public executePhase(budget: number, ctx: FrameContext, phase: PhaseT): void {
		void budget;
		void ctx;
		void phase;
		throw new Error('FrameExecutor.executePhase not implemented');
	}

	/**
	 * Execute a single worker function.
	 *
	 * Invoked by a parent in the hierarchy ({@link executeCategory} /
	 * {@link executeSystem} / {@link executePhase}), which is responsible for
	 * measuring elapsed time around this call — taking `performance.now()` before
	 * and after to derive the `deltaTime` that represents the worker's actual
	 * execution time. The executor does not measure itself.
	 *
	 * @param budget - Time budget for this execution, in milliseconds.
	 * @param ctx - Per-frame execution context.
	 * @param worker - The worker function to run. Type settles with the registry
	 *   worker contract (`() => boolean`).
	 * @returns Whether more work remains for this worker (`true` = more remains).
	 */
	public executeWorker(budget: number, ctx: FrameContext, worker: unknown): boolean {
		void budget;
		void ctx;
		void worker;
		throw new Error('FrameExecutor.executeWorker not implemented');
	}
}
