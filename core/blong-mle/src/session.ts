/**
 * session — an MLE session against a Blong gateway, for callers that are not
 * the browser.
 *
 * The callers are `blong-dev proxy` and the Storybook dev-server plugin, and
 * what both need is one thing: a terminating call.  The params are encrypted to
 * the gateway and the response is decrypted, so the caller speaks plain JSON
 * while the gateway keeps its encryption — one implementation of the wire
 * format, in `client.ts`, instead of one per tool.
 *
 * When the session holds credentials it can re-login, which is how a
 * pre-authenticated dev session outlives the 15-minute access token.
 */
import {
    createMleClient,
    type IMleAuth,
    type IMleCallOptions,
    type IMleClientOptions,
} from './client.ts';

/** How long before expiry the session is re-authenticated. */
const REAUTH_MARGIN_MS = 30_000;

export interface IMleSessionOptions extends IMleClientOptions {
    /** Credentials the session re-authenticates with. */
    username?: string;
    password?: string;
}

export interface IMleSession {
    /** The login response, or null when the session is not authenticated. */
    readonly auth: IMleAuth | null;
    /**
     * Authenticated RPC call.  Pass `{public: true}` for pre-auth endpoints
     * (`login.*`), which use the handshake keys and carry no bearer token.
     */
    call(method: string, params?: unknown, options?: IMleCallOptions): Promise<unknown>;
    /** Install an externally captured login response (manual-login mode). */
    setAuth(auth: IMleAuth): void;
    /**
     * Re-login when the current token is near expiry.  Cheap to call before
     * every request; a no-op without credentials.
     */
    ensureFresh(): Promise<void>;
    /** The credentials a caller can hand to someone else to log in with. */
    readonly credentials: {username?: string; password?: string};
}

export async function createMleSession(options: IMleSessionOptions): Promise<IMleSession> {
    const client = await createMleClient(options);
    const {username, password} = options;

    // `auth.expires_in` is a lifetime, not a countdown, so the wall-clock expiry
    // is recorded here and consulted by `ensureFresh`.
    let accessExpiresAt = 0;
    const rememberLogin = () => {
        const auth = client.auth;
        if (auth && typeof auth.expires_in === 'number') {
            accessExpiresAt = Date.now() + auth.expires_in * 1000;
        }
    };
    rememberLogin();

    return {
        get auth() {
            return client.auth;
        },
        call(method, params, callOptions) {
            return client.call(method, params, callOptions);
        },
        setAuth(auth) {
            client.setAuth(auth);
        },
        get credentials() {
            return {username, password};
        },
        async ensureFresh(): Promise<void> {
            if (!username || !password) return;
            if (accessExpiresAt && Date.now() < accessExpiresAt - REAUTH_MARGIN_MS) return;
            await client.login(username, password);
            rememberLogin();
        },
    };
}
