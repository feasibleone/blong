import {validation} from '@feasibleone/blong';

/**
 * `blong.digest.get` — what changed since a point in time.
 *
 * Declared in the `gateway` layer because that is what puts the method on the
 * RPC route (see `blongFlowFind.ts`).
 *
 * NOTE: the digest page asks the portal for the permission `blong.digest.find`,
 * while the call this route declares is `blong.digest.get`. The two names must
 * agree for RBAC to gate what the page actually calls.
 */
export default validation(
    async ({lib: {type}}) =>
        function blongDigestGet() {
            return {
                params: type.Object({
                    since: type.Optional(type.String()),
                    limit: type.Optional(type.Number()),
                }),
                result: type.Unknown(),
            };
        },
);
