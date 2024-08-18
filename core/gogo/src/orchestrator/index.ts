import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./common'],
    default: {
        dispatch: false,
        common: true,
    },
}));
