/**
 * sample.item.add — create a new sample item.
 */

import {handler} from '@feasibleone/blong';

let nextId = 100;

export default handler(blong => async function sampleItemAdd(params: {
    itemName: string;
    itemCategory: string;
    itemPrice: number;
    isActive?: boolean;
}) {
    const item = {
        itemId: ++nextId,
        ...params,
        isActive: params.isActive ?? true,
        createdAt: new Date().toISOString().split('T')[0],
    };
    return item;
});
