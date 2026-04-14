import {realm} from '@feasibleone/blong/types';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        http: blong.type.Boolean(),
        browser: blong.type.Boolean(),
    }),
    children: globalThis.window ? import.meta.glob(['./browser/*.ts']) : ['./browser'],
    config: {
        default: {
            http: false,
            generic: false,
            browser: true,
        },
    },
}));
