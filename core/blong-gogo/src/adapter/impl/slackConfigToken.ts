/**
 * slackConfigToken.ts — a Slack app configuration token, as a pair that has to be renewed.
 *
 * A configuration token is what lets a process maintain the app it belongs to: read the manifest,
 * rewrite the two request URLs, and create an app where none exists yet. It expires, and
 * `tooling.tokens.rotate` answers a new access token *and* a new refresh token — spending the old
 * refresh token in the process. The pure part is here so a test can assert when a pair is due and
 * what a rotation answered without a workspace, and `slack.ts` is only the HTTP around it
 * (`@@D-797`).
 */

/** What a rotation answered, as far as this port reads it. */
export interface ISlackTokenRotation {
    ok?: boolean;
    error?: string;
    /** The new access token (`xoxe.xoxp-…`). */
    token?: string;
    /** The new refresh token, which replaces the one the request spent. */
    refresh_token?: string;
    /** Seconds since the epoch, after which `token` stops working. */
    exp?: number;
}

/** The credentials `apps.manifest.create` hands back for an app it just made. */
export interface ISlackAppCredentials {
    app_id?: string;
    credentials?: {
        client_id?: string;
        client_secret?: string;
        signing_secret?: string;
        verification_token?: string;
    };
}

/** How long before the expiry a token is renewed, so a call never runs on a token one tick from death. */
export const SLACK_TOKEN_SKEW_SECONDS = 600;

/**
 * The expiry as seconds since the epoch.
 *
 * A rotation answers a number while a database column is a timestamp, so both shapes arrive here and
 * neither is guessed: a string is parsed, and anything unreadable is *unknown* rather than `now` —
 * which would rotate on every start and spend a pair each time.
 */
export const slackTokenExpiry = (value: number | string | undefined): number | undefined => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
};

/** Whether a pair is due for a rotation, given its expiry. An expiry nobody knows is never due. */
export const slackTokenExpiring = (
    expiresAt: number | string | undefined,
    nowSeconds = Math.floor(Date.now() / 1000),
    skewSeconds = SLACK_TOKEN_SKEW_SECONDS,
): boolean => {
    const expiry = slackTokenExpiry(expiresAt);
    if (expiry === undefined) return false;
    return expiry - skewSeconds <= nowSeconds;
};

/** The account fields a rotation produced, or nothing when Slack refused it. */
export const slackRotationPatch = (
    rotation: ISlackTokenRotation | undefined,
): {configToken?: string; configRefreshToken?: string; configTokenExpiresAt?: number} => {
    if (!rotation?.ok || !rotation.token || !rotation.refresh_token) return {};
    return {
        configToken: rotation.token,
        configRefreshToken: rotation.refresh_token,
        ...(typeof rotation.exp === 'number' ? {configTokenExpiresAt: rotation.exp} : {}),
    };
};

/**
 * The manifest an app is created from.
 *
 * Deliberately without a request URL: the addresses carry the app id and the client id in their path,
 * so neither can be written into the manifest before Slack has created the app and answered them. The
 * port reads the app back and re-points it in the same breath, which is the step it already performs
 * for an app that exists (`@@D-796`). The scopes are the ones the realm's README installs by hand.
 */
export const slackManifestDraft = (
    name: string,
    scopes: string[] = ['chat:write', 'files:read', 'channels:history', 'im:history'],
): Record<string, unknown> => ({
    display_information: {name},
    features: {bot_user: {display_name: name, always_online: false}},
    oauth_config: {scopes: {bot: scopes}},
    settings: {
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        is_mcp_enabled: false,
    },
});

/** What an app creation says about the app it made, or nothing when it refused. */
export const slackAppPatch = (
    created: ISlackAppCredentials | undefined,
): {appId?: string; clientId?: string; signingSecret?: string} => {
    const credentials = created?.credentials;
    return {
        ...(created?.app_id ? {appId: created.app_id} : {}),
        ...(credentials?.client_id ? {clientId: credentials.client_id} : {}),
        ...(credentials?.signing_secret ? {signingSecret: credentials.signing_secret} : {}),
    };
};
