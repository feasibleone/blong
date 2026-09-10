/**
 * Register an expected callback
 */

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import type {ICallbackRegistration} from '../../../types.js';

/**
 * Store for pending callback promises
 * Key: correlationId
 * Value: {resolve, reject, timeout, type}
 */
const pendingCallbacks = new Map<
    string,
    {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
        type: string;
    }
>();

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
    callbackCallbackRegister: (registration: ICallbackRegistration, _$meta: IMeta) => {
        const {correlationId, type, timeout = 30000} = registration;

        // Check if already registered
        if (pendingCallbacks.has(correlationId)) {
            throw new Error(`Callback already registered for correlation ID: ${correlationId}`);
        }

        // Create the pending promise
        let resolve: (value: unknown) => void;
        let reject: (error: Error) => void;

        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        void promise; // intentionally unused — resolve/reject are captured below

        // Build the entry object before the timeout so the closure can reference it.
        // callbackCallbackWait may replace pending.reject; using the entry object
        // ensures the timeout always calls the most-recent reject.
        const entry: {
            resolve: (value: unknown) => void;
            reject: (error: Error) => void;
            timeout: NodeJS.Timeout;
            type: string;
        } = {
            resolve: resolve!,
            reject: reject!,
            type,
            timeout: undefined as unknown as NodeJS.Timeout,
        };

        // Set up timeout — calls entry.reject so callbackWait can intercept it
        const timeoutHandle = setTimeout(() => {
            pendingCallbacks.delete(correlationId);
            entry.reject(
                new Error(
                    `Callback timeout after ${timeout}ms for ${type} (correlation: ${correlationId})`,
                ),
            );
        }, timeout);

        entry.timeout = timeoutHandle;

        // Store the entry
        pendingCallbacks.set(correlationId, entry);

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
