import {server} from '@feasibleone/blong';

const openapiServer = server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        openapi: blong.type.Object({}),
    }),
    children: ['../blong-openapi'],
    config: {
        default: {},
    },
}));

type Load = (...params: unknown[]) => Promise<{start: () => Promise<unknown>}>;

const openapi = async (load: Load, config: unknown): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(openapiServer, 'impl', config, ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
};

export default async (load: Load): Promise<void> =>
    openapi(load, {
        'blong-openapi': {
            openapi: {
                api: {
                    namespace: {
                        time: [
                            '../test/api/world-time.yaml',
                            '../test/api/world-time.operations.yaml',
                            // {servers: [{url: 'http://localhost:8081'}]},
                        ],
                    },
                },
            },
        },
    });
