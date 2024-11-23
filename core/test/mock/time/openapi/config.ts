import {handler} from '@feasibleone/blong';

export default handler(proxy => ({
    config: {
        api: {
            namespace: {
                mocktime: [
                    '../../../api/world-time.yaml',
                    '../../../api/world-time.operations.yaml',
                    {servers: [{url: 'http://localhost:8081'}]},
                ].map(file =>
                    typeof file === 'string' ? new URL(file, import.meta.url).href : file
                ),
            },
        },
    },
    namespace: ['mocktime'],
}));
