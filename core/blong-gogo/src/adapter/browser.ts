import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        http: blong.type.Boolean(),
        browser: blong.type.Boolean(),
    }),
    children: ['./browser'],
    config: {
        default: {
            http: false,
            browser: true,
        },
    },
}));
