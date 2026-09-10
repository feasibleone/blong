import {handler} from '@feasibleone/blong';

/**
 * Protected reference endpoint granted to the `Guest` role via the
 * `guestBasic` capability.  Demonstrates that self-registered guests can call
 * this action (200) while being denied admin-only actions (403).
 */
export default handler(
    () =>
        async function accessTestGuest(): Promise<{success: boolean}> {
            return {success: true};
        },
);
