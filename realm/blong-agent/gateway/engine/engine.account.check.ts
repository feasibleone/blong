import {validation} from '@feasibleone/blong';

/**
 * `engine.account.check` — whether this process can answer for an account, and in which mode.
 *
 * The implementation is the engine adapter's (`core/blong-gogo`,
 * `adapter/server/engine/engineAccountCheck.ts`); this file is what publishes it, because a gateway
 * serves only the methods its own layer validates. Without it the method exists in the process and
 * nowhere a caller can reach — an encrypted call to the path answered `gateway.mleUndecoded`, which
 * reads as a cipher problem and is a missing route.
 *
 * Authenticated: the answer names a host's accounts and their modes, and the deployment asks it
 * before claiming a ticket (`@@D-700`).
 */
export default validation(
    async ({lib: {type}}) =>
        function engineAccountCheck() {
            return {
                params: type.Object({
                    account: type.String({maxLength: 64}),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
