import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./test'],
    default: {},
    dev: {},
    microservice: {},
    integration: {
        test: true,
    },
}));
