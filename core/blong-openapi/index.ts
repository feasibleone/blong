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

const openapi = async (load, config): Promise<void> => {
    const realms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(openapiServer, 'impl', config, ['microservice', 'integration', 'dev']),
    ]);
    for (const realm of realms) await realm.start();
};

export default async (load): Promise<void> =>
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
