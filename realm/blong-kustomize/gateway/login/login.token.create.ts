import {validation} from '@feasibleone/blong';

/**
 * gateway/login/login.token.create.ts — the one method reachable without a token.
 *
 * The file name is the method it validates. `auth: 'login'` tells the gateway not to ask for a
 * bearer here, which is the only reason a login is possible at all: every other route may require
 * one.
 *
 * The result is left open on purpose. What this method returns is the portal's token response,
 * whose shape belongs to the browser side of the framework, and restating it here would be a second
 * definition of a contract this realm does not own.
 */
export default validation(
    async ({lib: {type}}) =>
        function loginTokenCreate() {
            return {
                auth: 'login',
                params: type.Object({
                    // Optional, and ignored: the token in `password` is the credential, and the
                    // TokenReview is what names the caller. The form asks for a name only because
                    // its own validation requires something in the field.
                    username: type.Optional(type.String()),
                    password: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
