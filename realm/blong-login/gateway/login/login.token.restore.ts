import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function loginTokenRestore() {
            return {
                // Pre-auth — restores a session from the path-scoped HttpOnly cookie.
                auth: 'login',
                params: type.Object({}, {additionalProperties: true}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
