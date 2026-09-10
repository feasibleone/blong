import {type IMeta, handler} from '@feasibleone/blong';

import {type GoogleConfig} from './google.ts';
import {discoverOidcConfiguration} from './oidc.ts';

/**
 * Client-safe Google OAuth configuration.
 *
 * Returns the subset of the Google OAuth client config that the browser needs
 * to start the authorization-code flow — provider base URL, resolved
 * authorization endpoint, and the public client id.  The client secret is
 * never exposed.
 *
 * The authorization endpoint is resolved from OIDC discovery when not
 * configured explicitly, so real Google
 * (`https://accounts.google.com/o/oauth2/v2/auth`) and the local mock
 * (`http://localhost:9082/authorize`) both work with zero front-end
 * configuration.
 *
 * The config is the same `db.google` slice consumed by `accessIdentityCheck`
 * (realm `server.ts` default merged with the suite `srv.db.google` override),
 * so the browser always sees the config matching the server-side flow.
 */
export default handler(
    ({lib: {googleConfig}}) =>
        async function accessGoogleGet(
            _params: Record<string, never>,
            _$meta: IMeta,
        ): Promise<{
            baseUrl: string;
            authorizationEndpoint: string;
            clientId: string;
            redirectUri: string | null;
        }> {
            const google = {
                ...(googleConfig<GoogleConfig>() ?? {}),
                ...((this.config as {google?: object} | undefined)?.google ?? {}),
            };
            if (!google.clientId || !google.baseUrl) {
                throw new Error('Google OAuth client is not configured');
            }
            const baseUrl = (google.baseUrl ?? 'https://accounts.google.com').replace(/\/$/, '');
            let authorizationEndpoint = google.authorizationEndpoint;
            if (!authorizationEndpoint) {
                const oidc = await discoverOidcConfiguration(
                    google.discoveryUrl ?? `${baseUrl}/.well-known/openid-configuration`,
                );
                authorizationEndpoint = oidc?.authorization_endpoint ?? `${baseUrl}/authorize`;
            }
            return {
                baseUrl,
                authorizationEndpoint,
                clientId: google.clientId,
                redirectUri: google.redirectUri ?? null,
            };
        },
);
