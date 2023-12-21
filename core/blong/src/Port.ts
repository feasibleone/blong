import { Port } from 'ut-port';

import { internal } from '../types.js';
import type { adapter } from './adapter.js';

export type Port = {
    new(portApi: Parameters<adapter>[0] & {config: unknown})
}

export default class PortImpl extends internal {
    constructor(config) {
        super();
        return Port(config);
    }
}
