import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        dispatch: blong.type.Boolean(),
        common: blong.type.Boolean(),
    }),
    children: ['./common'],
    config: {
        default: {
            dispatch: false,
            common: true,
        },
    },
}));
