/**
 * `.blong_callrc` — the file `blong-dev call` and `blong-dev proxy` both read.
 *
 * A gateway is reached with an address and a credential, and the same two travel for every method a
 * person calls by hand. Keeping them in a file rather than in flags means a call is
 * `blong-dev call chat.prompt.ask '{"kind":"text"}'` — the recurring part lives once, and the person
 * types only what is different (`@@D-801`).
 *
 * Three things the file may say, each with a fallback that has to be reachable without it:
 *
 * - **servers** by alias, each an address and the credentials used to reach it;
 * - **route**, mapping a method prefix to a server alias, so a repository talking to three processes
 *   names none of them on the command line;
 * - **payload**, the defaults a method starts from, by exact name or by prefix — the parts of a call
 *   that are the same every time (a platform, an account, a conversation) sit here, and the command
 *   line supplies the rest.
 *
 * A fourth, `plain`, names the methods whose params travel in the clear. The gateway decodes MLE only
 * on a route that requires auth: a route served `auth: false` is public, so its encrypted params would
 * reach the handler as an opaque string and fail validation for properties the caller did send
 * (`@@F-710`). The list is the exception rather than the rule — a realm that requires auth on its
 * routes needs nothing here — so an entry is a temporary answer, and the route behind it is worth
 * revisiting.
 *
 * The file is found upward from the working directory and is ignored by git (`.blong_*`), because it
 * carries a password. A flag overrides it, then the environment, and a call that names neither a
 * server nor a routable method falls back to `default.server`, then to `target`, then to the one
 * server the file declares.
 */
import {readFileSync} from 'node:fs';

import {parse as parseYaml} from 'yaml';

import {findUp} from './utils/findConfig.ts';

/** The file name, found upward from the working directory. */
export const CALL_RC = '.blong_callrc';

/** One gateway a caller can reach. */
export interface IServerEntry {
    /** The gateway's base address, e.g. `http://localhost:8080`. */
    url?: string;
    username?: string;
    password?: string;
}

/** What the file may declare. */
export interface ICallRc {
    /** Servers by alias; the alias is what `route` and `--server` name. */
    server?: Record<string, IServerEntry>;
    /** Credentials for every server, where an entry does not carry its own. */
    username?: string;
    password?: string;
    /** Method prefix → server alias. An exact key wins, then the longest dotted prefix. */
    route?: Record<string, string>;
    /** Default payloads, by exact method name or by prefix. The command line merges over them. */
    payload?: Record<string, Record<string, unknown>>;
    /**
     * Methods whose params are sent unencrypted: `true` for all of them, or the method names and
     * prefixes whose routes the gateway serves without auth.
     */
    plain?: boolean | string[];
    /** The server a method with no route goes to. */
    default?: {server?: string} | string;
    /** A bare address, for a file that names no alias at all. */
    target?: string;
}

/** A server resolved for one call, with where it came from. */
export interface IResolvedServer {
    /** The alias the file gave it, when it has one. */
    alias?: string;
    entry: IServerEntry & {url: string};
    /** Which part of the file (or the environment) answered — printed by `--dry-run`. */
    source: string;
}

/** Read the file, if one is above the working directory. */
export function loadCallRc(
    cwd: string = process.cwd(),
): {path: string; config: ICallRc} | undefined {
    const path = findUp(cwd, CALL_RC);
    if (!path) return undefined;
    const parsed = parseYaml(readFileSync(path, 'utf8')) as ICallRc | null;
    return {path, config: parsed ?? {}};
}

/**
 * Whether a route or payload key covers a method, treating the trailing dot as optional.
 *
 * Both `chat` and `chat.` read as "anything under chat" to a person, so both mean it here; the exact
 * method name covers itself and is not a prefix of a longer one.
 */
function keyCovers(key: string, method: string): 'exact' | 'prefix' | undefined {
    const trimmed = key.replace(/\.+$/, '');
    if (!trimmed) return undefined;
    if (method === trimmed) return 'exact';
    return method.startsWith(`${trimmed}.`) ? 'prefix' : undefined;
}

/**
 * The entry a method belongs to: the exact name, then the longest dotted prefix.
 *
 * Shared by `route` and `payload`, because both answer "is there something for this method", and a
 * prefix is how a person says it once — `chat` for the whole realm, `chat.prompt.ask` for the call
 * that needs more than the realm's defaults.
 */
export function matchByKey<T>(
    map: Record<string, T> | undefined,
    method: string,
): {key: string; value: T} | undefined {
    if (!map) return undefined;
    const exact = map[method];
    if (exact !== undefined) return {key: method, value: exact};
    let best: {key: string; value: T} | undefined;
    for (const [key, value] of Object.entries(map)) {
        if (keyCovers(key, method) === 'prefix' && (!best || key.length > best.key.length)) {
            best = {key, value};
        }
    }
    return best;
}

/** The default payload a method starts from: its prefixes', then its own, merged. */
export function defaultPayload(rc: ICallRc, method: string): Record<string, unknown> {
    const prefixed = Object.entries(rc.payload ?? {})
        .filter(([key]) => keyCovers(key, method) === 'prefix')
        .sort((left, right) => left[0].length - right[0].length)
        .map(([, value]) => value);
    const exact = rc.payload?.[method];
    return mergePayload(...prefixed, ...(exact ? [exact] : []));
}

/** Merge payload fragments, later ones winning; objects merge, anything else replaces. */
export function mergePayload(
    ...parts: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const part of parts) {
        if (!part) continue;
        for (const [key, value] of Object.entries(part)) {
            const before = merged[key];
            merged[key] =
                isPlainObject(before) && isPlainObject(value)
                    ? mergePayload(before, value)
                    : value;
        }
    }
    return merged;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Set a value at a dotted path, creating what is missing; `a.b.c=1` reaches `{a:{b:{c:1}}}`. */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const steps = path.split('.').filter(Boolean);
    if (!steps.length) throw new Error('a payload key is required (`--payload.key=value`)');
    let node = target;
    for (const step of steps.slice(0, -1)) {
        const next = node[step];
        if (!isPlainObject(next)) node[step] = {};
        node = node[step] as Record<string, unknown>;
    }
    const last = steps[steps.length - 1] as string;
    node[last] = value;
}

/**
 * A `--payload.<path>=<value>` argument, or `undefined` for any other option.
 *
 * The value is read as JSON when it is one (`10` is a number, `true` a boolean, `null` a null) and
 * kept as text otherwise, because a flag carries strings and a payload rarely wants all of them to be
 * strings — `--payload.paging.pageSize=10` has to reach the server as a number.
 */
export function payloadFlag(name: string, raw: string): {path: string; value: unknown} | undefined {
    const prefix = 'payload.';
    if (!name.startsWith(prefix)) return undefined;
    const path = name.slice(prefix.length);
    if (!path) throw new Error('a payload key is required (`--payload.key=value`)');
    return {path, value: coerce(raw)};
}

const coerce = (raw: string): unknown => {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return raw;
    }
};

/**
 * Read the payload a caller wrote: JSON when it is JSON, YAML otherwise.
 *
 * The manual form is YAML because `{kind: text, text: "Which one?"}` needs no quoting of its keys,
 * and the machine form is JSON because that is what a program emits. JSON is tried first so a
 * document that is valid in both is read as JSON — YAML would turn `yes` into a boolean and `1.0`
 * into a float.
 */
export function parsePayload(text: string | undefined): Record<string, unknown> | undefined {
    const trimmed = text?.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (!isPlainObject(parsed)) {
                throw new Error('the payload must be a mapping of parameters, not a list');
            }
            return parsed;
        } catch (error) {
            // A JSON-looking text that does not parse may still be YAML — `{a: b}` is the manual
            // form the file is written in — so the fallback below decides.
            if ((error as Error).message.startsWith('the payload must be')) throw error;
        }
    }
    let parsed: unknown;
    try {
        parsed = parseYaml(trimmed);
    } catch (error) {
        throw new Error(`cannot read the payload as JSON or YAML: ${(error as Error).message}`);
    }
    if (parsed === undefined || parsed === null) return undefined;
    if (!isPlainObject(parsed)) {
        throw new Error('the payload must be a mapping of parameters, not a list or a scalar');
    }
    return parsed;
}

/**
 * A method name as the gateway addresses it.
 *
 * The gateway takes `subject.object.predicate` (or the same three as a path), and the repository names
 * a handler by joining them — `chatPromptAsk`. Both are accepted, and the joined form is split by its
 * capital letters, which is exactly how the three words are joined.
 */
export function methodName(raw: string): string {
    const trimmed = raw?.trim();
    if (!trimmed) throw new Error('a method name is required (`subject.object.predicate`)');
    if (trimmed.includes('.')) return trimmed;
    if (trimmed.includes('/')) return trimmed.split('/').filter(Boolean).join('.');
    const parts = trimmed.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/);
    if (parts.length === 3)
        return parts.map(part => part.toLowerCase()).join('.');
    throw new Error(
        `cannot read "${raw}" as a method: write it as subject.object.predicate ` +
            `(the joined form works only when it is three words)`,
    );
}

/** Which server a call goes to, and why. */
export function resolveServer(
    rc: ICallRc,
    options: {method: string; alias?: string; target?: string; env?: NodeJS.ProcessEnv} = {
        method: '',
    },
): IResolvedServer {
    const env = options.env ?? process.env;
    const servers = rc.server ?? {};
    const named = (alias: string | undefined, source: string): IResolvedServer | undefined => {
        if (!alias) return undefined;
        const entry = servers[alias];
        if (!entry?.url) {
            const known = Object.keys(servers);
            throw new Error(
                `no server "${alias}" with a url (${source})` +
                    (known.length ? ` — this file declares: ${known.join(', ')}` : ''),
            );
        }
        return {alias, entry: {...entry, url: entry.url}, source};
    };

    const explicit = named(options.alias, '--server');
    if (explicit) return explicit;

    const routed = matchByKey(rc.route, options.method);
    const fromRoute = named(routed?.value, `route "${routed?.key ?? ''}"`);
    if (fromRoute) return fromRoute;

    const fallback = typeof rc.default === 'string' ? rc.default : rc.default?.server;
    const fromDefault = named(fallback, 'default.server');
    if (fromDefault) return fromDefault;

    const target = options.target ?? env.MLE_TARGET ?? rc.target;
    if (target) return {entry: {url: target}, source: 'target'};

    const aliases = Object.keys(servers);
    if (aliases.length === 1) {
        return named(aliases[0], 'the only server the file declares') as IResolvedServer;
    }
    throw new Error(
        aliases.length
            ? `cannot tell which server "${options.method}" goes to — name one with --server ` +
                  `(${aliases.join(', ')}) or add it to route`
            : `no server to call — write one in ${CALL_RC} (server.<alias>.url) or pass --target`,
    );
}

/**
 * Whether a method's params travel in the clear.
 *
 * The gateway decodes MLE only where the route requires auth (`@@F-710`), so a public route's params
 * are the caller's to send as JSON — and a caller cannot see the route's `auth` from outside, which is
 * why this is written down.
 */
export function plainOf(rc: ICallRc, method: string): boolean {
    if (rc.plain === true) return true;
    if (!Array.isArray(rc.plain)) return false;
    return rc.plain.some(entry => {
        const trimmed = entry.replace(/\.+$/, '');
        return Boolean(trimmed) && (method === trimmed || method.startsWith(`${trimmed}.`));
    });
}

/** The credentials a resolved server is reached with: its own, then the file's, then the environment. */
export function credentialsOf(
    rc: ICallRc,
    entry: IServerEntry,
    env: NodeJS.ProcessEnv = process.env,
): {username?: string; password?: string} {
    const username = entry.username ?? rc.username ?? env.MLE_USERNAME;
    const password = entry.password ?? rc.password ?? env.MLE_PASSWORD;
    return {...(username && {username}), ...(password && {password})};
}
