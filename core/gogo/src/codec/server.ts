import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./adapter'],
    config: {
        default: {
            adapter: true,
        },
        dev: {},
        microservice: {},
        integration: {},
    },
}));
