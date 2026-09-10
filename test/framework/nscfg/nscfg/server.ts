import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./test'],
    config: {
        default: {},
        integration: {
            test: true,
            namespace: {
                cfg: {source: 'namespace-override'},
            },
        },
    },
}));
