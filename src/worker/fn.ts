/**
 * A worker's frame-budgeted function. A **bounded chunk per call**: returns
 * `true` when more work remains (the broker calls it again within budget) and
 * `false` when the worker is drained. The boolean is both the "complete?" and
 * the demand signal. See `_specs/features/adaptive-budget.md` → worker contract.
 */
export type WorkerFn = () => boolean;
