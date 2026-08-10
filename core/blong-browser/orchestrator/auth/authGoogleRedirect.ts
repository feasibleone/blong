import {type IMeta, handler} from '@feasibleone/blong';

type GoogleConfig = {
    baseUrl?: string;
    clientId?: string;
    redirectUri?: string;
    scope?: string;
    /**
     * Full authorization endpoint (e.g. Google's `https://accounts.google.com/o/oauth2/v2/auth`).
     * Defaults to `${baseUrl}/authorize` (the local mock's path).
     */
    authorizationEndpoint?: string;
};

/**
 * Fetch the client-safe Google OAuth config from the backend (`access.google.get`).
 *
 * The gateway exposes it as a plain, unauthenticated JSON-RPC endpoint
 * (`auth: false`, no MLE), so the browser can fetch it with a plain `fetch()`
 * before any session token exists.  Returns `undefined` when the backend is
 * unreachable or misconfigured, letting callers fall back to the local
 * `config.google`.
 */
async function fetchGoogleConfig(): Promise<GoogleConfig | undefined> {
    try {
        const res = await fetch('/rpc/access/google/get', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'access.google.get',
                params: {},
            }),
        });
        if (!res.ok) return undefined;
        const body = (await res.json()) as {result?: GoogleConfig};
        return body?.result?.clientId ? body.result : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Default redirect URI — the SPA's OAuthCallback route relative to the current
 * origin/base path (e.g. `http://host/s/oauth/callback`).  Used only when no
 * redirect URI is configured.
 */
function defaultRedirectUri(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    const {origin, pathname} = window.location;
    const base = pathname.endsWith('/') ? pathname : `${pathname}/`;
    return `${origin}${base}oauth/callback`;
}

/**
 * Starts the Google OAuth authorization-code flow by redirecting the browser
 * to the provider's authorization endpoint.  The provider (or the local mock)
 * redirects back to `redirectUri` with a `code`, which `authGoogleLogin` then
 * exchanges.
 *
 * Google config is fetched at runtime from the backend's `access.google.get`
 * endpoint (client-safe subset — base URL, authorization endpoint, client id),
 * so no front-end google configuration is required.  Falls back to the auth
 * component's `config.google` when the backend is unreachable (e.g. Storybook).
 */
export default handler(
    ({config}) =>
        async function authGoogleRedirect(
            _params: Record<string, never>,
            _$meta: IMeta,
        ): Promise<{url: string}> {
            const local = (config?.google ?? {}) as GoogleConfig;
            const remote = await fetchGoogleConfig();
            const google: GoogleConfig = {
                baseUrl: remote?.baseUrl ?? local.baseUrl,
                authorizationEndpoint:
                    remote?.authorizationEndpoint ?? local.authorizationEndpoint,
                clientId: remote?.clientId ?? local.clientId,
                redirectUri: local.redirectUri ?? remote?.redirectUri ?? defaultRedirectUri(),
                scope: local.scope ?? remote?.scope,
            };
            if (!google.baseUrl || !google.clientId || !google.redirectUri) {
                throw new Error('Google login is not configured');
            }

            const base = google.baseUrl.endsWith('/') ? google.baseUrl.slice(0, -1) : google.baseUrl;
            const url = new URL(google.authorizationEndpoint ?? `${base}/authorize`);
            url.searchParams.set('client_id', google.clientId);
            url.searchParams.set('redirect_uri', google.redirectUri);
            url.searchParams.set('response_type', 'code');
            url.searchParams.set('scope', google.scope ?? 'openid email profile');
            url.searchParams.set('state', Math.random().toString(36).slice(2));

            if (typeof window !== 'undefined') {
                window.location.href = url.toString();
            }
            return {url: url.toString()};
        },
);
