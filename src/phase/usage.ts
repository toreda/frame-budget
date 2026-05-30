import {type CategoryUsage} from '../category/usage.js';
import {type NodeUsage} from '../node/usage.js';

/** Usage for one phase: its own totals plus a per-category breakdown. */
export interface PhaseUsage extends NodeUsage {
	/** Per-category usage, keyed by category name. */
	categories: Record<string, CategoryUsage>;
}
