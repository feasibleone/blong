/**
 * sample.item.find — list sample items with pagination.
 */

import {handler} from '@feasibleone/blong';

// In-memory data store for demonstration
const items = [
    {itemId: 1, itemName: 'Widget Alpha', itemCategory: 'tools', itemPrice: 29.99, isActive: true, createdAt: '2024-01-15'},
    {itemId: 2, itemName: 'Gadget Beta', itemCategory: 'electronics', itemPrice: 49.99, isActive: true, createdAt: '2024-02-20'},
    {itemId: 3, itemName: 'Thingamajig Gamma', itemCategory: 'tools', itemPrice: 15.00, isActive: false, createdAt: '2024-03-10'},
    {itemId: 4, itemName: 'Doohickey Delta', itemCategory: 'accessories', itemPrice: 9.99, isActive: true, createdAt: '2024-04-05'},
    {itemId: 5, itemName: 'Whatchamacallit Epsilon', itemCategory: 'electronics', itemPrice: 99.99, isActive: true, createdAt: '2024-05-12'},
];

export default handler(blong => async function sampleItemFind(params: {
    paging?: {pageSize: number; pageNumber: number};
    criteria?: {search?: string};
}) {
    let filtered = [...items];

    if (params.criteria?.search) {
        const search = params.criteria.search.toLowerCase();
        filtered = filtered.filter(
            i => i.itemName.toLowerCase().includes(search) || i.itemCategory.toLowerCase().includes(search),
        );
    }

    const pageSize = params.paging?.pageSize ?? 20;
    const pageNumber = params.paging?.pageNumber ?? 1;
    const start = (pageNumber - 1) * pageSize;

    return {
        items: filtered.slice(start, start + pageSize),
        pagination: {
            recordsTotal: filtered.length,
            pageSize,
            pageNumber,
        },
    };
});
