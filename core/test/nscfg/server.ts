import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    config: {
        override: {
            namespace: {
                cfg: {
                    source: 'namespace-override',
                },
            },
        },
    },
}));
