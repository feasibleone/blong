/**
 * sample.item.get — get a single sample item by ID.
 */

import {handler} from '@feasibleone/blong';

const items: Record<number, Record<string, unknown>> = {
    1: {itemId: 1, itemName: 'Widget Alpha', itemCategory: 'tools', itemPrice: 29.99, isActive: true, createdAt: '2024-01-15'},
    2: {itemId: 2, itemName: 'Gadget Beta', itemCategory: 'electronics', itemPrice: 49.99, isActive: true, createdAt: '2024-02-20'},
    3: {itemId: 3, itemName: 'Thingamajig Gamma', itemCategory: 'tools', itemPrice: 15.00, isActive: false, createdAt: '2024-03-10'},
};

export default handler(blong => async function sampleItemGet(params: {itemId: number}) {
    const item = items[params.itemId];
    if (!item) throw new Error(`Item ${params.itemId} not found`);
    return item;
});
