import {type NodeUsage} from '../node/usage.js';
import {type SystemUsage} from '../system/usage.js';

/** Usage for one category: its own totals plus a per-system breakdown. */
export interface CategoryUsage extends NodeUsage {
	/** Per-system usage, keyed by system name. */
	systems: Record<string, SystemUsage>;
}
