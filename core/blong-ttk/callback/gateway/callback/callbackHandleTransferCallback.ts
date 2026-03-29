/**
 * Handle incoming transfer callbacks
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';

export default handler(({handler: {callbackCallbackReceive}}) => ({
    /**
     * Handle PUT /transfers/:id callback
     * 
     * @param params - Request parameters
     * @param $meta - Metadata
     */
    callbackHandleTransferCallback: async (
        params: {
            id: string;
            body: any;
            headers: Record<string, string>;
        },
        $meta: IMeta,
    ) => {
        // Dispatch to callbackReceive with the transfer ID as correlation ID
        await callbackCallbackReceive(
            {
                correlationId: params.id,
                type: 'PUT /transfers/{ID}',
                status: 200,
                headers: params.headers,
                body: params.body,
            },
            $meta,
        );

        return {success: true};
    },
}));
