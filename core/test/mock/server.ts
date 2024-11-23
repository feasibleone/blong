import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        time: blong.type.Boolean(),
    }),
    children: ['./time'],
    config: {
        default: {},
        integration: {
            time: true,
        },
    },
}));
