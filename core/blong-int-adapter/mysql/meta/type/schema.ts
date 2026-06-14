import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    item: type.Object({
        itemId: type.Integer({default: 'auto-increment'}),
        itemName: type.String(),
        itemActive: type.Optional(type.Boolean()),
    }),
}));
