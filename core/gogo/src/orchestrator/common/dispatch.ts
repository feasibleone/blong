import {orchestrator, type IMeta} from '@feasibleone/blong';

export default orchestrator<{destination?: string}>(({remote}) => ({
    async init(...configs: object[]) {
        await super.init({type: 'dispatch'}, ...configs);
    },
    start() {
        super.connect();
        return super.start();
    },
    async exec(...params: unknown[]) {
        const destination = this.config.destination;
        if (destination && params.length > 1) {
            const $meta = params.pop() as IMeta;
            if ($meta?.method) {
                return (
                    await remote.dispatch(...params, {
                        ...$meta,
                        method: destination + '/' + $meta.method,
                    })
                )?.[0];
            }
        }
    },
}));
