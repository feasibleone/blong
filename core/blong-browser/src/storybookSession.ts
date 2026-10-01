/**
 * storybookSession — the browser's half of the Storybook live-backend support.
 *
 * The Storybook dev-server plugin (`storybookBackend.ts`) is the other half.
 * Calling its endpoint does two things at once:
 *
 *  - it returns the role's credentials when the story is in the MLE mode (that
 *    mode logs in from the page, so that the browser's own key pair is the one
 *    the gateway encrypts for), and
 *  - the response's cookies tell the plugin which role — and which transport —
 *    the following `/rpc` calls belong to (the plugin cannot sniff that without
 *    consuming the request body, see `MODE_COOKIE`).
 *
 * A token is deliberately *not* returned: the gateway encrypts the response to
 * every login, so a token minted by the plugin cannot be read back out of it.
 * The reviewer still never sees a login screen — the decorator logs in with
 * these credentials before it renders the story.
 */
export interface IStorybookLiveSession {
    role?: string;
    /** Present in the MLE mode: the role's seeded user. */
    username?: string;
    password?: string;
}

/**
 * Ask the dev server for a session in `role`, telling it which transport the
 * following `/rpc` calls will use.  Returns `undefined` when there is no dev
 * server behind the story (a static Storybook build, or no plugin).
 */
export async function fetchStorybookSession(
    role: string,
    mode: 'jsonrpc' | 'mle',
): Promise<IStorybookLiveSession | undefined> {
    if (typeof window === 'undefined') return undefined;
    try {
        const url = `${window.location.origin}/__blong/storybook?role=${encodeURIComponent(
            role,
        )}&mode=${mode}`;
        const response = await fetch(url, {headers: {accept: 'application/json'}});
        if (!response.ok) return undefined;
        return (await response.json()) as IStorybookLiveSession;
    } catch {
        return undefined;
    }
}
