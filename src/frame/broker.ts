import {type DefaultPhase} from '../default/phase.js';
import {Defaults} from '../defaults.js';
import {type RegistrySnapshot} from '../registry/snapshot.js';
import {type ScheduleSnapshot} from '../schedule/snapshot.js';
import {type Unsubscribe} from '../unsubscribe.js';
import {type WorkerInit} from '../worker/init.js';
import {type WorkerRef} from '../worker/ref.js';
import {type FrameBrokerInit} from './broker/init.js';
import {FrameRegistry} from './registry.js';
import {FrameScheduler} from './scheduler.js';

/**
 * Top-level orchestrator and parent container — and the package's **sole public
 * entry point**. Owns the registry, scheduler, and executor and brokers all
 * interaction between them; they are fully decoupled, internal, and never
 * communicate directly. All consumer-facing operations (worker registration,
 * phase registration, budget config) go through `FrameBroker` so any resulting
 * state changes, schedule rebuilds, or housekeeping are always performed or
 * queued as part of the call.
 *
 * @typeParam PhaseT - String union of all phases for this broker. Provide it
 *   explicitly for custom phases (`new FrameBroker<AppPhase>(...)`) so the
 *   compiler validates `init.phases` against it. Defaults to
 *   {@link DefaultPhase} (`'setup' | 'main' | 'cleanup'`) when omitted.
 */
export class FrameBroker<PhaseT extends string = DefaultPhase> {
	/**
	 * Phases in execution order. Position in the array determines the order in
	 * which phases run. Append-only via {@link addPhase} (until the broker is
	 * running); phases are never removed.
	 */
	private readonly _phases: PhaseT[];

	/** Phase set used to validate phase arguments. Mirrors {@link _phases}. */
	private readonly _phaseSet: Set<PhaseT>;

	/**
	 * The passive work store the scheduler reads. Internal: consumers register
	 * through {@link registerWorker}, never by touching the registry directly.
	 */
	private readonly registry: FrameRegistry<PhaseT>;

	/**
	 * The planning engine. Internal: the broker notifies it of registry changes
	 * (via {@link onRegistryChanged}) and drives its rebuild; consumers never
	 * touch it directly.
	 */
	private readonly scheduler: FrameScheduler;

	/**
	 * Whether the broker has started its run loop. Some configuration
	 * (notably {@link addPhase}) is only allowed **before** running.
	 */
	private _running = false;

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
		this._phases = phases.slice();
		this._phaseSet = new Set<PhaseT>(this._phases);
		this.registry = new FrameRegistry<PhaseT>();
		this.scheduler = new FrameScheduler();

		const fps = init.fps ?? Defaults.Broker.Fps;
		// Fall back to the default rather than constructing an invalid broker.
		this._fps = FrameBroker.isValidFps(fps) ? fps : Defaults.Broker.Fps;
		this._budgetPct = init.budgetPct ?? (() => Defaults.Broker.BudgetPct);
	}

	/**
	 * Phases in execution order (read-only view). Position determines run order.
	 * Grow with {@link addPhase}; phases are never removed.
	 */
	public get phases(): readonly PhaseT[] {
		return this._phases;
	}

	/** Whether the broker's run loop has started. */
	public get isRunning(): boolean {
		return this._running;
	}

	/** Current target frames per second. */
	public get fps(): number {
		return this._fps;
	}

	/**
	 * Register a frame-budgeted worker through the broker (the only public way to
	 * add work). Delegates to the internal registry, auto-creating any missing
	 * nodes along `path`, then performs/queues any broker-side housekeeping the
	 * new registration requires (e.g. marking the schedule stale).
	 *
	 * @param path - Node names from the tree root down to the worker's owning
	 *   node (e.g. `['engine','renderer']`). Empty registers at the root.
	 * @param init - The worker descriptor: `{name, fn, phase, config?}`.
	 * @param forceScheduleUpdate - When `true`, rebuild the schedule **now** so
	 *   this worker can run in the *same* frame. Default `false`: the worker is
	 *   added immediately but first runs **next frame** (the schedule rebuilds
	 *   lazily). Forcing pays the sort cost synchronously — reserve it for the
	 *   rare case that demands same-frame execution.
	 * @returns An {@link Unsubscribe} handle that removes this worker when called.
	 * @throws If `init.phase` is not a registered phase of this broker.
	 */
	public registerWorker(
		path: readonly string[],
		init: WorkerInit<PhaseT>,
		forceScheduleUpdate = false
	): Unsubscribe {
		if (!this.isValidPhase(init.phase)) {
			throw new Error(`FrameBroker.registerWorker: unknown phase '${String(init.phase)}'`);
		}

		this.registry.register(path, init.name, init.fn, init.phase, init.config);
		this.onRegistryChanged(forceScheduleUpdate);

		let active = true;
		return (): boolean => {
			if (!active) {
				return false;
			}
			active = false;
			return this.unregisterWorker(path, init.name, init.phase);
		};
	}

	/**
	 * Register several workers under the **same** owning `path` in one call. A
	 * thin wrapper that calls {@link registerWorker} per item — no separate code
	 * path — so each worker is validated and housekept exactly as a single
	 * registration. Phase is still per-worker (each `init` carries its own).
	 *
	 * `forceScheduleUpdate` is applied **once after all inserts** (not per item),
	 * so a forced bulk registration pays a single synchronous rebuild covering the
	 * whole batch.
	 *
	 * @param path - Shared owning-node path for every worker in this call.
	 * @param inits - One {@link WorkerInit} per worker.
	 * @param forceScheduleUpdate - Rebuild the schedule once after the batch so
	 *   the new workers can run this frame (see {@link registerWorker}). Default
	 *   `false`.
	 * @returns One {@link Unsubscribe} handle per worker, in input order.
	 * @throws If any `init.phase` is not a registered phase (it throws on that
	 *   item; workers before it in the list remain registered).
	 */
	public registerWorkers(
		path: readonly string[],
		inits: WorkerInit<PhaseT>[],
		forceScheduleUpdate = false
	): Unsubscribe[] {
		const handles = inits.map((init) => this.registerWorker(path, init));
		if (forceScheduleUpdate) {
			this.scheduler.rebuildIfDirty();
		}
		return handles;
	}

	/**
	 * Remove a single worker by its `(path, name, phase)` identity. The one
	 * removal code path: the registry deletes the worker and, if anything was
	 * removed, broker-side housekeeping runs. The {@link Unsubscribe} handle from
	 * {@link registerWorker} delegates here.
	 *
	 * @returns `true` if a worker was removed, `false` if none matched.
	 */
	public unregisterWorker(path: readonly string[], worker: string, phase: PhaseT): boolean {
		const removed = this.registry.unregister(path, worker, phase);
		if (removed) {
			this.onRegistryChanged();
		}
		return removed;
	}

	/**
	 * Remove several workers in one call. A thin wrapper over
	 * {@link unregisterWorker} — no separate code path.
	 *
	 * @param refs - One {@link WorkerRef} (`{path, name, phase}`) per worker.
	 * @returns One boolean per ref, in input order (`true` = removed).
	 */
	public unregisterWorkers(...refs: WorkerRef<PhaseT>[]): boolean[] {
		return refs.map((ref) => this.unregisterWorker(ref.path, ref.name, ref.phase));
	}

	/**
	 * Add a new phase to the **end** of the execution order. Phases are
	 * **permanent**: there is no removal counterpart, and adding the same phase
	 * twice is a no-op.
	 *
	 * Phases may only be added **before the broker is running** — the run loop
	 * iterates a fixed phase order, so growing it mid-run is rejected.
	 *
	 * @param phase - The phase to append.
	 * @returns `true` if the phase was added, `false` if it already existed.
	 * @throws If the broker is already running.
	 */
	public addPhase(phase: PhaseT): boolean {
		if (this._running) {
			throw new Error(
				`FrameBroker.addPhase: cannot add phase '${String(phase)}' after the broker is running`
			);
		}
		if (this._phaseSet.has(phase)) {
			return false;
		}
		this._phaseSet.add(phase);
		this._phases.push(phase);
		return true;
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
		return this._phaseSet.has(phase);
	}

	/**
	 * Mark the broker as running, locking the phase set ({@link addPhase} is no
	 * longer allowed). Idempotent.
	 *
	 * This is the minimal running-state seam; the full lifecycle (a
	 * `@toreda/lifecycle` `ClientDelegate` driving startup/shutdown) is a planned
	 * follow-up. See `_specs/systems/broker.md` → lifecycle.
	 */
	public start(): void {
		this._running = true;
	}

	/**
	 * Debug-only **deep copy** of the current worker registration tree as plain
	 * data — for printing, logging, or asserting on registrations in a test. The
	 * returned value shares **no** references with the live registry: `Map`s are
	 * flattened to arrays and each worker's live `fn` is reduced to a `hasFn`
	 * boolean, so it carries no callable reference and mutating it cannot affect
	 * broker state.
	 *
	 * > **Heavy call — not for normal operation.** This walks the entire work
	 * > tree and allocates a full copy every time. It is a diagnostics/inspection
	 * > tool only; do **not** call it on the per-frame hot path (ideally not every
	 * > frame at all). Reach for it when debugging, not during steady-state
	 * > scheduling.
	 *
	 * @returns A {@link RegistrySnapshot} of the tree, or `undefined` if nothing
	 *   is registered yet.
	 */
	public registrySnapshot(): RegistrySnapshot<PhaseT> {
		return this.registry.snapshot();
	}

	/**
	 * Debug-only **copy** of the scheduler's current state as plain data — for
	 * printing, logging, or asserting on it in a test. The returned value shares
	 * no references with the scheduler's internals, so inspecting or
	 * `JSON.stringify`ing it cannot touch live scheduling state.
	 *
	 * > **Heavy call — not for normal operation.** Like {@link registrySnapshot}
	 * > this allocates a fresh copy on every call and is a diagnostics tool only;
	 * > do **not** call it on the per-frame hot path (ideally not every frame).
	 *
	 * > **Partial today.** The scheduler's priority-ordered plan is not
	 * > implemented yet, so the snapshot reports only the observable `built` /
	 * > `dirty` state and its `plan` is reserved (`undefined`). It will carry the
	 * > full ordered plan once the schedule shape is finalized — see
	 * > `_specs/systems/scheduler.md` → schedule build.
	 *
	 * @returns A {@link ScheduleSnapshot} of the scheduler's current state.
	 */
	public scheduleSnapshot(): ScheduleSnapshot {
		return this.scheduler.snapshot();
	}

	/**
	 * Broker-side housekeeping after the work tree changes (register /
	 * unregister). The registry mutates immediately, but the scheduler's cached
	 * plan does not: this marks it **dirty** so it rebuilds on the next
	 * {@link FrameScheduler.getSchedule}. A worker registered this frame therefore
	 * first runs **next** frame — the intended default.
	 *
	 * When `force` is set (a `forceScheduleUpdate` request), the rebuild is done
	 * **synchronously now** so the change takes effect this same frame. This pays
	 * the sort cost immediately; it is the rare-case escape hatch. Kept as a
	 * single seam so every register/unregister path funnels bookkeeping here.
	 *
	 * @param force - Rebuild synchronously now instead of deferring to the next
	 *   `getSchedule()`. Default `false`.
	 */
	private onRegistryChanged(force = false): void {
		this.scheduler.markDirty();
		if (force) {
			this.scheduler.rebuildIfDirty();
		}
	}
}
