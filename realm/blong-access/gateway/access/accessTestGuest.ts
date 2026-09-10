import {validation} from '@feasibleone/blong';

/**
 * Protected reference endpoint granted to the `Guest` role.  Proves the RBAC
 * gate: guests can call it (200) while admin-only actions remain 403.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessTestGuest() {
            return {
                params: type.Object({}),
                result: type.Object({success: type.Boolean()}),
            };
        },
);
