/**
 * sample.item.remove — delete a sample item by ID.
 */

import {handler} from '@feasibleone/blong';

export default handler(blong => async function sampleItemRemove(params: {
    itemId: number;
}) {
    return {itemId: params.itemId};
});
