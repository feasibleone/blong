import type {IChatAccount, IChatAccountMap} from '@feasibleone/blong/types';

/**
 * Which account a request belongs to, for every platform.
 *
 * A request names `appId` and `clientId` in its path — the UT shape, kept because an existing app
 * configuration already points at those two (`@@D-677`). The alias is the map key a person chose, and
 * it is what the realm is given: never the token or the secret that proved the request.
 */
export interface IChatAccountFound {
    name: string;
    account: IChatAccount;
}

export const chatAccountFind = (
    accounts: IChatAccountMap | undefined,
    appId?: string,
    clientId?: string,
): IChatAccountFound | undefined => {
    if (!accounts) return undefined;
    for (const [name, account] of Object.entries(accounts)) {
        if (account.appId === appId && account.clientId === clientId) return {name, account};
    }
    return undefined;
};

/** The single account a caller may leave unnamed — the ordinary case of one bot per platform. */
export const chatAccountName = (
    accounts: IChatAccountMap | undefined,
    account?: string,
): string | undefined => {
    if (account) return account;
    const names = Object.keys(accounts ?? {});
    return names.length === 1 ? names[0] : undefined;
};

/**
 * The account map inside what a realm answered when a port asked it for one.
 *
 * A dispatched answer arrives as the value the handler returned, sometimes wrapped in the array a
 * transport carries, so both shapes are read here. An empty map answers `undefined` rather than `{}`:
 * that is what lets a port fall back to its own configured accounts when the store holds none,
 * while a store that holds accounts replaces them (`@@D-797`).
 */
export const chatAccountsFromDispatch = (value: unknown): IChatAccountMap | undefined => {
    const answer = Array.isArray(value) ? value[0] : value;
    if (!answer || typeof answer !== 'object') return undefined;
    const accounts = (answer as {accounts?: unknown}).accounts;
    if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return undefined;
    return Object.keys(accounts).length ? (accounts as IChatAccountMap) : undefined;
};

/**
 * The API base a call for one account is made against.
 *
 * An account may name its own — a test account calls the simulator while the same process posts to a
 * real workspace with another (`@@D-687`) — and the port's `url` is what an account that names none
 * falls back to.
 */
export const chatAccountBase = (
    accounts: IChatAccountMap | undefined,
    account: string | undefined,
    fallback?: string,
): string | undefined => {
    const name = chatAccountName(accounts, account);
    return (name && accounts?.[name]?.url) || fallback;
};

/**
 * The public address a platform posts to for one account.
 *
 * The port's own path carries the ids a request names, so the public address is that path with them
 * filled in and the optional trailing segment dropped — one URL serves Events and Interactivity,
 * which is why it has no verb in it. Used for Viber's registration and for pointing a Slack app at a
 * tunnel (`@@D-688`).
 */
export const chatPublicUrl = (path: string, base: string, account: IChatAccount): string => {
    const resolved = path
        .replace(/\{appId\}/g, account.appId ?? '')
        .replace(/\{clientId\}/g, account.clientId ?? '')
        .replace(/\/\{[A-Za-z0-9_]+\?\}/g, '')
        .replace(/\/+$/, '');
    return `${base.replace(/\/+$/, '')}${resolved}`;
};
