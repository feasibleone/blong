import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    config: {
        default: {},
        dev: {
            adapter: {},
        },
    },
}));
