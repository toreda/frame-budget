import {type CategoryUsage} from '../category/usage.js';
import {type PhaseUsage} from '../phase/usage.js';
import {type SystemUsage} from '../system/usage.js';
import {type WorkerUsage} from '../worker/usage.js';
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
 * ## Strictly iterate + execute + measure
 *
 * The executor does **no** sorting, priority resolution, or allocation. Ordering
 * is baked into the schedule at {@link FrameScheduler} build time; the executor
 * walks the already-ordered structure it is handed. Its one extra job is
 * **measurement** — it returns the consumed-time stats the scheduler needs to
 * adapt.
 *
 * ## Execution hierarchy
 *
 * The broker iterates phases and calls {@link executePhase} for each; execution
 * then descends the taxonomy, each level receiving the **minimum scoped
 * information** it needs and returning its bottom-up usage rollup:
 *
 * - {@link executePhase} → {@link PhaseUsage} — iterate the phase's registered
 *   categories.
 * - {@link executeCategory} → {@link CategoryUsage} — iterate a category's
 *   registered systems.
 * - {@link executeSystem} → {@link SystemUsage} — iterate a system's registered
 *   workers; **measures** each worker (`performance.now()` deltas around
 *   {@link executeWorker}).
 * - {@link executeWorker} → {@link WorkerUsage} — run **one** worker function.
 *
 * A phase iterates only the nodes actually **registered** to it; a phase with no
 * registered workers has 0 objects to iterate.
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
 * each phase is far cheaper than resolving a dependency graph, while still
 * guaranteeing cross-phase order (everything in phase N runs before phase N+1).
 *
 * @typeParam PhaseT - String union of the broker's phases.
 */
export class FrameExecutor<PhaseT extends string = string> {
	/**
	 * Execute a single phase: walk its registered categories (in schedule order)
	 * within `budget` and return the phase-level usage rollup.
	 *
	 * @param budget - Time budget for this phase, in milliseconds.
	 * @param ctx - Per-frame execution context (created at frame start, released
	 *   at frame end).
	 * @param phase - The phase being executed.
	 * @param phaseWork - The phase's registered work, ordered at schedule build.
	 *   Type settles with the {@link FrameScheduler} schedule shape.
	 * @returns Usage aggregated per category / system / worker for this phase.
	 */
	public executePhase(budget: number, ctx: FrameContext, phase: PhaseT, phaseWork: unknown): PhaseUsage {
		void budget;
		void ctx;
		void phase;
		void phaseWork;
		throw new Error('FrameExecutor.executePhase not implemented');
	}

	/**
	 * Execute a category: walk its registered systems within `budget` and return
	 * the category-level usage rollup.
	 *
	 * @param budget - Time budget for this category, in milliseconds.
	 * @param ctx - Per-frame execution context.
	 * @param category - The category to execute. Type settles with the registry
	 *   taxonomy.
	 * @returns Usage aggregated per system / worker for this category.
	 */
	public executeCategory(budget: number, ctx: FrameContext, category: unknown): CategoryUsage {
		void budget;
		void ctx;
		void category;
		throw new Error('FrameExecutor.executeCategory not implemented');
	}

	/**
	 * Execute a system: walk its registered workers within `budget`, **measuring**
	 * each via `performance.now()` deltas around {@link executeWorker}, and return
	 * the system-level usage rollup.
	 *
	 * @param budget - Time budget for this system, in milliseconds.
	 * @param ctx - Per-frame execution context.
	 * @param system - The system to execute. Type settles with the registry
	 *   taxonomy.
	 * @returns Usage aggregated per worker for this system.
	 *
	 * **Tombstone skip (required).** A worker unregistered mid-frame is still
	 * present in this frame's already-built schedule. Before invoking each
	 * worker's `fn`, this loop MUST check the worker's `alive` flag (set `false`
	 * on unregister) and **skip** any tombstoned worker — a single boolean read,
	 * no allocation. This guarantees an unsubscribed worker never runs again this
	 * frame and that a torn-down `fn` is never called. See
	 * `_specs/systems/executor.md` → tombstone skip.
	 */
	public executeSystem(budget: number, ctx: FrameContext, system: unknown): SystemUsage {
		void budget;
		void ctx;
		void system;
		throw new Error('FrameExecutor.executeSystem not implemented');
	}

	/**
	 * Execute a single worker function.
	 *
	 * Invoked by {@link executeSystem}, which measures elapsed time around this
	 * call — taking `performance.now()` before and after to derive the worker's
	 * actual consumed time. The executor does not measure itself from within.
	 *
	 * @param budget - Time budget for this worker, in milliseconds.
	 * @param ctx - Per-frame execution context.
	 * @param worker - The worker function to run. Type settles with the registry
	 *   worker contract (`() => boolean`).
	 * @returns This worker's usage (calls + consumed ms) for this frame.
	 */
	public executeWorker(budget: number, ctx: FrameContext, worker: unknown): WorkerUsage {
		void budget;
		void ctx;
		void worker;
		throw new Error('FrameExecutor.executeWorker not implemented');
	}
}
