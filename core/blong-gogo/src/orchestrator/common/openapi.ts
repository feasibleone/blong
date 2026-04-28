import {orchestrator} from '@feasibleone/blong/types';

export default orchestrator<{api: {namespace: Record<string, string | string[]>}}>(
    ({registry}) => ({
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
            const result = await super.start({});
            const assets: {[namespace: string]: unknown} = {};
            for (const [key, value] of Object.entries(this.config.api.namespace))
                assets[key] = await (this as unknown as {link(s: string): Promise<unknown>}).link(
                    `${value as string}.asset`,
                );
            await registry.loadApi(
                'orchestrator.openapi.api',
                {namespace: assets as Record<string, string | string[]>},
                'assets',
            );
            return result;
        },
    }),
);
