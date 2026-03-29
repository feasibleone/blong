/**
 * sample.item.edit — update an existing sample item.
 */

import {handler} from '@feasibleone/blong';

export default handler(blong => async function sampleItemEdit(params: {
    itemId: number;
    itemName: string;
    itemCategory: string;
    itemPrice: number;
    isActive?: boolean;
}) {
    const item = {
        ...params,
        isActive: params.isActive ?? true,
    };
    return item;
});
