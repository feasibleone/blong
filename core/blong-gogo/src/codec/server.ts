import {realm} from '@feasibleone/blong/types';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./adapter', './test'],
    config: {
        default: {
            adapter: true,
            // The codec realm turns a transport into handlers; it is plumbing every process carries,
            // not a service a deployment publishes and not a companion a microservice repeats on its
            // own (D-433). Declared in `default` because the answer is the same in every intent — the
            // operator runs `release`, so a block beside `default` would never be merged.
            k8s: {k8sRealmRole: 'none'},
        },
        dev: {},
        microservice: {},
        integration: {
            test: true,
        },
    },
}));
