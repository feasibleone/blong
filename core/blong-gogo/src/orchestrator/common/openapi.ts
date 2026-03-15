import {orchestrator} from '@feasibleone/blong/types';

export default orchestrator<{api?: {namespace: Record<string, string | string[]>}}>(
    ({remote, registry}) => ({
        activation: {
            default: {
                type: 'openapi',
                namespace: ['openapi'],
                imports: [/(?<!codec)\.openapi$/],
                api: {
                    namespace: {},
                },
            },
        },
        async start() {
            super.connect();
            const result = await super.start();
            await registry.loadApi('orchestrator.openapi.api', this.config.api);
            return result;
        },
    }),
);
