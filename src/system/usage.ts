import {type NodeUsage} from '../node/usage.js';
import {type WorkerUsage} from '../worker/usage.js';

/** Usage for one system: its own totals plus a per-worker breakdown. */
export interface SystemUsage extends NodeUsage {
	/** Per-worker usage, keyed by worker name. */
	workers: Record<string, WorkerUsage>;
}
