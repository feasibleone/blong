import {Port as UtPort} from 'ut-port';

import {Internal} from '../types.js';
import type {IAdapterFactory} from './adapter.js';

export interface IPort {
    new (portApi: Parameters<IAdapterFactory>[0] & {config: unknown});
}

export default class Port extends Internal {
    public constructor(config: unknown) {
        super();
        return UtPort(config);
    }
}
