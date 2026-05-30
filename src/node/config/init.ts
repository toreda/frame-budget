import {type NodeConfig} from '../config.js';

/** Per-node config a caller may supply at registration; unset fields default. */
export type NodeConfigInit = Partial<NodeConfig>;
