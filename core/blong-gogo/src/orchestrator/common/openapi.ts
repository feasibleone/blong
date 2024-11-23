import {orchestrator} from '@feasibleone/blong';

export default orchestrator<{api?: {namespace: Record<string, string | string[]>}}>(
    ({remote, registry}) => ({
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'openapi',
                    namespace: ['openapi'],
                    imports: [/(?<!codec)\.openapi$/],
                    api: {
                        namespace: {},
                    },
                },
                ...configs
            );
        },
        async start() {
            super.connect();
            const result = await super.start();
            await registry.loadApi('orchestrator.openapi.api', this.config.api);
            return result;
        },
    })
);
