import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    children: ['./test'],
    config: {
        default: {},
        integration: {
            test: true,
        },
    },
}));
