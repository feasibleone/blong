import {Internal, type IAdapterFactory} from '@feasibleone/blong/types';
// import {Port as UtPort} from 'ut-port';

const UtPort = (config: unknown) =>
    class Port extends Internal {
        findHandler(name: string): unknown {
            return null;
        }
    };

export interface IPort {
    new (portApi: Parameters<IAdapterFactory>[0] & {config: unknown; configBase: string});
}

export default class Port extends Internal {
    public constructor(config: unknown) {
        super();
        const result = UtPort(config);
        const findHandler = result.prototype.findHandler;
        result.prototype.findHandler = function (name: string) {
            return findHandler.call(this, name.replaceAll('.', '').toLowerCase());
        };
        return result;
    }
}
