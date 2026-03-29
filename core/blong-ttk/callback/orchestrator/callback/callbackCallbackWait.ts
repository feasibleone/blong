/**
 * Wait for a callback to arrive
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';
import {getPendingCallbacks} from './callbackCallbackRegister.js';

export default handler(() => ({
    /**
     * Wait for a previously registered callback to arrive
     * 
     * This returns the promise created by callbackRegister, which
     * will be resolved when the callback arrives via callbackReceive.
     * 
     * @param params - Wait parameters
     * @param $meta - Metadata
     * @returns Promise that resolves with callback data
     */
    callbackCallbackWait: async (
        params: {correlationId: string; type?: string},
        $meta: IMeta,
    ) => {
        const {correlationId} = params;
        const pendingCallbacks = getPendingCallbacks();

        const pending = pendingCallbacks.get(correlationId);
        if (!pending) {
            throw new Error(
                `No callback registered for correlation ID: ${correlationId}. ` +
                `Did you forget to call callbackRegister first?`,
            );
        }

        // Wait for the promise to resolve (or timeout)
        // The promise is resolved by callbackReceive when the callback arrives
        try {
            const result = await new Promise((resolve, reject) => {
                // Replace the stored handlers to capture the result here
                const original = pending;
                pending.resolve = (value: any) => {
                    clearTimeout(original.timeout);
                    pendingCallbacks.delete(correlationId);
                    resolve(value);
                };
                pending.reject = (error: Error) => {
                    clearTimeout(original.timeout);
                    pendingCallbacks.delete(correlationId);
                    reject(error);
                };
            });

            return result;
        } catch (error: any) {
            throw new Error(`Callback wait failed: ${error.message}`);
        }
    },
}));
