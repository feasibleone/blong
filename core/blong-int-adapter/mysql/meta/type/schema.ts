import {schema} from '@feasibleone/blong';

export default schema(async ({lib: {type}}) => ({
    item: type.Object({
        itemId: type.Integer({format: 'int64'}),
        itemName: type.String(),
        itemActive: type.Optional(type.Boolean()),
    }),
}));
