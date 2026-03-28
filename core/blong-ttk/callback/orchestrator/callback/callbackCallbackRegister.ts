/**
 * Register an expected callback
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';
import type {ICallbackRegistration} from '../../../types.js';

/**
 * Store for pending callback promises
 * Key: correlationId
 * Value: {resolve, reject, timeout, type}
 */
const pendingCallbacks = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    type: string;
}>();

export default handler(() => ({
    /**
     * Register an expected callback
     * 
     * This creates a pending promise that will be resolved when
     * the matching callback arrives via callbackReceive.
     * 
     * @param registration - Callback registration details
     * @param $meta - Metadata
     */
    callbackCallbackRegister: (registration: ICallbackRegistration, $meta: IMeta) => {
        const {correlationId, type, timeout = 30000} = registration;

        // Check if already registered
        if (pendingCallbacks.has(correlationId)) {
            throw new Error(
                `Callback already registered for correlation ID: ${correlationId}`,
            );
        }

        // Create the pending promise
        let resolve: (value: any) => void;
        let reject: (error: Error) => void;

        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        // Set up timeout
        const timeoutHandle = setTimeout(() => {
            pendingCallbacks.delete(correlationId);
            reject!(
                new Error(
                    `Callback timeout after ${timeout}ms for ${type} (correlation: ${correlationId})`,
                ),
            );
        }, timeout);

        // Store the promise handlers
        pendingCallbacks.set(correlationId, {
            resolve: resolve!,
            reject: reject!,
            timeout: timeoutHandle,
            type,
        });

        return {
            success: true,
            correlationId,
            type,
            timeout,
        };
    },
}));

/**
 * Get pending callback store (for use by callbackReceive)
 */
export function getPendingCallbacks() {
    return pendingCallbacks;
}
