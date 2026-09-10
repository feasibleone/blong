/**
 * Receive and dispatch an incoming callback
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';
import type {ICallbackReceipt} from '../../../types.js';
import {getPendingCallbacks} from './callbackCallbackRegister.js';

export default handler(() => ({
    /**
     * Handle an incoming callback
     * 
     * This resolves the pending promise created by callbackRegister,
     * allowing the waiting test step to continue.
     * 
     * @param receipt - Callback data
     * @param $meta - Metadata
     */
    callbackCallbackReceive: (receipt: ICallbackReceipt, _$meta: IMeta) => {
        const {correlationId, type, status, headers, body} = receipt;
        const pendingCallbacks = getPendingCallbacks();

        const pending = pendingCallbacks.get(correlationId);
        if (!pending) {
            // No one is waiting for this callback
            console.warn(
                `Received callback for unregistered correlation ID: ${correlationId} (${type})`,
            );
            return {
                success: false,
                message: 'No pending callback found',
            };
        }

        // Clear timeout
        clearTimeout(pending.timeout);

        // Resolve the promise with the callback data
        pending.resolve({
            correlationId,
            type,
            status,
            headers,
            body,
        });

        // Remove from pending
        pendingCallbacks.delete(correlationId);

        return {
            success: true,
            correlationId,
            type,
        };
    },
}));
