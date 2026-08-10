import {library} from '@feasibleone/blong';

/** Identity-flow selector for the Google exchange (`oidc` default, `oauth` option). */
export type GoogleFlow = 'oidc' | 'oauth';

/** Google OAuth client configuration consumed by `accessIdentityCheck`. */
export type GoogleConfig = {
    /** Provider base URL — local mock in dev, `https://accounts.google.com` in production. */
    baseUrl?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    /**
     * Full authorization endpoint (e.g. Google's
     * `https://accounts.google.com/o/oauth2/v2/auth`).  When unset it is
     * resolved from OIDC discovery (`authorization_endpoint`), falling back to
     * `${baseUrl}/authorize` (the local mock's path).
     */
    authorizationEndpoint?: string;
    /**
     * OIDC discovery document URL (OIDC flow).  Defaults to
     * `${baseUrl}/.well-known/openid-configuration`; when unset/unreachable the
     * flow falls back to `${baseUrl}/token` + `${baseUrl}/certs`.
     */
    discoveryUrl?: string;
};

/**
 * Google OAuth client configuration.
 *
 * Read from the realm's `db` config slice (`config.<intent>.db.google` declared in
 * `server.ts`), so every suite that includes the access realm reuses the same defaults —
 * the local mock in `dev`, real Google endpoints (or an override) elsewhere.
 */
export default library(({config}) => {
    const google = ((config?.google ?? {}) as GoogleConfig);
    return {
        /** Return the effective Google OAuth client config from the realm `db.google` slice. */
        googleConfig(): GoogleConfig {
            return google;
        },
    };
});
