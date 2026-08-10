import {validation} from '@feasibleone/blong';

/**
 * Public RPC endpoint for the Google OAuth code exchange (no blong token
 * exists yet — the caller only holds a Google authorization code).  Uses
 * `auth: 'login'` so the gateway's MLE layer decrypts the request body
 * (same pre-auth level as `login.token.create`).
 */
export default validation(
    async ({lib: {type}}) =>
        function loginTokenExchange() {
            return {
                auth: 'login',
                params: type.Object({
                    provider: type.String(),
                    code: type.String(),
                    state: type.Optional(type.String()),
                    redirectUri: type.Optional(type.String()),
                    flow: type.Optional(type.Union([type.Literal('oidc'), type.Literal('oauth')])),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
