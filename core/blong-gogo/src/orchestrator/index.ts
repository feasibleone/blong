import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        openapi: blong.type.Boolean(),
        dispatch: blong.type.Boolean(),
        common: blong.type.Boolean(),
    }),
    children: ['./common'],
    config: {
        default: {
            openapi: false,
            dispatch: false,
            common: true,
        },
    },
}));
