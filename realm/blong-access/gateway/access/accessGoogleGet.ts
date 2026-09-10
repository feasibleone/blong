import {validation} from '@feasibleone/blong';

/**
 * Public RPC endpoint returning the client-safe Google OAuth config
 * (provider base URL, resolved authorization endpoint, client id).
 *
 * `auth: false` — no session token needed; the gateway serves it as plain
 * JSON-RPC (no MLE), so the browser can fetch it with a plain `fetch()` before
 * login.  Consumed by the blong-browser `authGoogleRedirect` orchestrator.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessGoogleGet() {
            return {
                auth: false,
                params: type.Object({}),
                result: type.Object({
                    baseUrl: type.String(),
                    authorizationEndpoint: type.String(),
                    clientId: type.String(),
                    redirectUri: type.Union([type.String(), type.Null()]),
                }),
            };
        },
);
