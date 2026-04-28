import {orchestrator, type IMeta} from '@feasibleone/blong/types';

export default orchestrator<{destination?: string; appendNamespace?: string}>(({remote}) => ({
    activation: {
        default: {
            type: 'dispatch',
        },
    },
    start() {
        super.connect();
        return super.start();
    },
    async exec(...params: unknown[]) {
        // Support both `destination` (slash-based routing, auto-stripped by methodPath)
        // and `appendNamespace` (dot-based prefix, stripped via stripNamespace on receiver).
        const destination = this.config.destination;
        const appendNamespace = this.config.appendNamespace;
        const prefix = destination ?? appendNamespace;
        const separator = destination ? '/' : '.';
        if (prefix && params.length > 1) {
            const $meta = params.pop() as IMeta;
            if ($meta?.method) {
                return (
                    (await remote.dispatch(...params, {
                        ...$meta,
                        method: prefix + separator + $meta.method,
                    })) as unknown[]
                )?.[0];
            }
        }
    },
}));
