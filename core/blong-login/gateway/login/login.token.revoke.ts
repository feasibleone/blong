import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function loginTokenRevoke() {
            return {
                // Bearer-authenticated (session id comes from the token's `ses`
                // claim) but self-service — skip the RBAC action-list check.
                skipAuthorize: true,
                params: type.Object({
                    sessionId: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
