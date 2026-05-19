import {Internal, type IAdapterFactory} from '@feasibleone/blong/types';
// import {Port as UtPort} from 'ut-port';

const UtPort = () =>
    class Port extends Internal {
        findHandler(_: string): unknown {
            return null;
        }
    };

export interface IPort {
    new (portApi: Parameters<IAdapterFactory>[0] & {config: unknown; configBase: string}): unknown;
}

export default class Port extends Internal {
    public constructor() {
        super();
        const result = UtPort();
        const findHandler = result.prototype.findHandler;
        result.prototype.findHandler = function (name: string) {
            return findHandler.call(this, name.replaceAll('.', '').toLowerCase());
        };
        return result as unknown as Port;
    }
}
