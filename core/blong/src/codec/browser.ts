import {realm} from '../../types.js';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./adapter', './test'],
    default: {
        adapter: true,
    },
    dev: {},
    microservice: {},
    integration: {
        test: true,
    },
}));
