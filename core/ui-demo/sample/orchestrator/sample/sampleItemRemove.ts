/**
 * sample.item.remove — delete a sample item by ID.
 *
 * In a real implementation, this would remove the item from the database.
 * This demo handler echoes the itemId to confirm the delete was called.
 */

import {handler} from '@feasibleone/blong';

export default handler(blong => async function sampleItemRemove(params: {
    itemId: number;
}) {
    return {itemId: params.itemId};
});
