/**
 * Handle incoming transfer error callbacks
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';

export default handler(({handler: {callbackCallbackReceive}}) => ({
    callbackHandleTransferErrorCallback: async (
        params: {
            id: string;
            body: unknown;
            headers: Record<string, string>;
        },
        $meta: IMeta,
    ) => {
        await callbackCallbackReceive(
            {
                correlationId: params.id,
                type: 'PUT /transfers/{ID}/error',
                status: 200,
                headers: params.headers,
                body: params.body,
            },
            $meta,
        );

        return {success: true};
    },
}));
