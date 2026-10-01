/**
 * storybookBackend — the Storybook dev-server half of the live-backend
 * toolbar.
 *
 * Storybook already reaches a gateway for everything that is *not* mocked,
 * because `defineBlongViteConfig` installs a `/rpc` proxy and Storybook merges
 * the project's own Vite config.  What is missing is authentication: a story
 * set a fake token, so any call the mock adapter did not answer was rejected.
 *
 * This plugin supplies the missing half:
 *
 *  - `GET /__blong/storybook?role=R` mints a token for role `R` — the gateway
 *    hands out a session for one of the seeded test users (`.blong_devrc`'s
 *    `storybook:` section, or the built-in defaults) — and remembers `R` in a
 *    cookie so the next `/rpc` calls know who they are.
 *  - In the `jsonrpc` mode it also terminates `/rpc`: the browser speaks plain
 *    JSON-RPC, the plugin adds the bearer token, and it decrypts the gateway's
 *    MLE-encrypted response.  In the `mle` mode it stays out of the way — the
 *    browser encrypts for itself — and only the token endpoint is used.
 *
 * The endpoint is loopback-only and is never mounted by an app build, so the
 * seeded development credentials it can hand back stay on the developer's
 * machine.  Never point `storybook.target` at a gateway whose credentials you
 * would not put in a `.blong_devrc`.
 */
import {getPath, loadDevRc} from '@feasibleone/blong-dev/devrc';
import {createMleSession, type IMleSession} from '@feasibleone/blong-mle';
import type {IncomingMessage, ServerResponse} from 'node:http';
import type {Plugin} from 'vite';

/** One login the toolbar can offer. */
export interface IStorybookRole {
    username: string;
    password: string;
}

/** The resolved `storybook:` configuration. */
export interface IStorybookBackendConfig {
    target: string;
    roles: Record<string, IStorybookRole>;
}

const DEFAULT_TARGET = 'http://localhost:8080';
const DEFAULT_PASSWORD = 'testPassword';
/**
 * The seeded test users.  `Admin`, `Manager` and `Guest` exist in
 * blong-access's dbTest seed; a realm that wants more roles adds them to its
 * `.blong_devrc` (or its own seed) — the toolbar lists whatever resolves.
 */
const DEFAULT_USERS: Record<string, string> = {
    Admin: 'testAdmin',
    Manager: 'testManager',
    Guest: 'testGuest',
};
/** Path the iframe calls; matched as a suffix so a Storybook base path works. */
const SESSION_PATH = '__blong/storybook';
/** Which role the `/rpc` calls belong to; set by the session endpoint. */
const ROLE_COOKIE = 'blong_storybook_role';
/**
 * Which transport the browser is using.  The session endpoint sets it, and the
 * `/rpc` middleware acts on it: in `jsonrpc` the plugin terminates the call
 * (plain JSON in, decrypted out), while in `mle` the browser encrypts for
 * itself and the request must reach the gateway untouched.  The mode travels in
 * a cookie rather than being sniffed from the body because reading the body
 * would consume the stream the pass-through needs.
 */
const MODE_COOKIE = 'blong_storybook_mode';

interface IRawRole {
    user?: unknown;
    username?: unknown;
    password?: unknown;
}

function isLoopback(req: IncomingMessage): boolean {
    const address = req.socket.remoteAddress ?? '';
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function sendJson(res: ServerResponse, status: number, payload: object, cookies?: string[]): void {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        ...(cookies?.length ? {'set-cookie': cookies} : {}),
    });
    res.end(JSON.stringify(payload));
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
}

/** Resolve the `storybook:` section of `.blong_devrc` over the built-in defaults. */
export function readStorybookBackendConfig(cwd?: string): IStorybookBackendConfig {
    const rc = loadDevRc(cwd);
    const section = rc
        ? (getPath(rc.config, 'storybook') as Record<string, unknown> | undefined)
        : undefined;
    const target = section && typeof section.target === 'string' ? section.target : DEFAULT_TARGET;
    const configured = (section?.roles ?? {}) as Record<string, string | IRawRole>;
    const roles: Record<string, IStorybookRole> = {};
    for (const [role, value] of Object.entries(configured)) {
        if (typeof value === 'string') {
            roles[role] = {username: value, password: DEFAULT_PASSWORD};
            continue;
        }
        const username = value.user ?? value.username;
        if (typeof username === 'string') {
            roles[role] = {
                username,
                password: typeof value.password === 'string' ? value.password : DEFAULT_PASSWORD,
            };
        }
    }
    if (Object.keys(roles).length === 0) {
        for (const [role, username] of Object.entries(DEFAULT_USERS)) {
            roles[role] = {username, password: DEFAULT_PASSWORD};
        }
    }
    return {target, roles};
}

/**
 * The `define` entries the toolbar reads to know which roles to offer.
 *
 * The value is injected rather than fetched because Storybook needs the items
 * synchronously when it builds the toolbar.
 */
export function storybookBackendDefine(cwd?: string): Record<string, string> {
    const {target, roles} = readStorybookBackendConfig(cwd);
    return {
        'globalThis.__BLONG_STORYBOOK__': JSON.stringify({target, roles: Object.keys(roles)}),
    };
}

/** Derive the dotted method name from a JSON-RPC body or the request path. */
function methodFromPath(path: string, bodyMethod?: unknown): string {
    if (typeof bodyMethod === 'string' && bodyMethod.includes('.')) return bodyMethod;
    const cleaned = path
        .replace(/^\/(rpc\/)?/, '')
        .replace(/\?.*$/, '')
        .replace(/\/$/, '');
    return cleaned.split('/').filter(Boolean).join('.');
}

async function readBody(req: IncomingMessage): Promise<string> {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw;
}

/**
 * The Vite plugin.  Mount it in a Storybook `viteFinal` (`storybookMain` adds it
 * automatically) — it is inert in a production build, where `configureServer`
 * never runs.
 */
export function storybookBackend(cwd?: string): Plugin {
    const config = readStorybookBackendConfig(cwd);
    const sessions = new Map<string, Promise<IMleSession>>();

    const sessionFor = (role: string): Promise<IMleSession> => {
        const credentials = config.roles[role];
        if (!credentials) {
            return Promise.reject(new Error(`Unknown Storybook role "${role}"`));
        }
        let session = sessions.get(role);
        if (!session) {
            session = createMleSession({
                url: config.target,
                username: credentials.username,
                password: credentials.password,
            });
            // A failed setup must not be cached, or every later call fails too.
            session.catch(() => sessions.delete(role));
            sessions.set(role, session);
        }
        return session;
    };

    const roleOf = (req: IncomingMessage, url: URL): string =>
        url.searchParams.get('role') ??
        readCookie(req, ROLE_COOKIE) ??
        Object.keys(config.roles)[0];

    return {
        name: 'blong-storybook-backend',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const raw = req.url ?? '';
                if (!raw.includes(SESSION_PATH)) return next();
                if (!isLoopback(req)) {
                    sendJson(res, 403, {error: 'The Storybook backend endpoint is loopback only'});
                    return;
                }
                const url = new URL(raw, 'http://localhost');
                const role = roleOf(req, url);
                const mode = url.searchParams.get('mode');
                const cookieFor = (value: string, name: string) =>
                    `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
                void handleSession(url, role).then(
                    ({status, payload}) =>
                        sendJson(res, status, payload, [
                            cookieFor(role, ROLE_COOKIE),
                            ...(mode === 'jsonrpc' || mode === 'mle'
                                ? [cookieFor(mode, MODE_COOKIE)]
                                : []),
                        ]),
                    error => sendJson(res, 500, {error: String(error?.message ?? error)}),
                );
            });

            server.middlewares.use((req, res, next) => {
                const raw = req.url ?? '';
                const pathname = raw.replace(/\?.*$/, '');
                if (!/(^|\/)rpc\//.test(pathname)) return next();
                if (!isLoopback(req)) return next();
                // MLE mode: the browser encrypts for the gateway itself, so the
                // request has to reach it unread (see MODE_COOKIE).
                if (readCookie(req, MODE_COOKIE) === 'mle') {
                    void handlePassthrough(req, res, raw).catch(error =>
                        sendJson(res, 502, {error: String(error?.message ?? error)}),
                    );
                    return;
                }
                void handleRpc(req, res, raw).catch(error =>
                    sendJson(res, 200, {
                        jsonrpc: '2.0',
                        error: {code: -32000, message: String(error?.message ?? error)},
                        id: null,
                    }),
                );
            });

            async function handleSession(
                url: URL,
                role: string,
            ): Promise<{status: number; payload: object}> {
                if (!url.searchParams.has('role')) {
                    // The toolbar's own discovery call.
                    return {
                        status: 200,
                        payload: {target: config.target, roles: Object.keys(config.roles)},
                    };
                }
                const credentials = config.roles[role];
                if (!credentials) {
                    return {status: 404, payload: {error: `Unknown role "${role}"`}};
                }
                // MLE mode logs in from the page, so it needs the role's
                // credentials; JSON-RPC mode needs none (the plugin holds the
                // session for it).
                //
                // A token cannot be minted *here* for the page to use: the
                // gateway encrypts the response to every login, so an unbound
                // token — one whose keys travel per request in the JWE header —
                // cannot be read back out of it.  Verified against a running
                // gateway; the page's own login is a real MLE session and the
                // browser's key pair stays the one that signs and encrypts.
                const wantsLogin = url.searchParams.get('mode') === 'mle';
                return {
                    status: 200,
                    payload: {
                        role,
                        ...(wantsLogin
                            ? {username: credentials.username, password: credentials.password}
                            : {}),
                    },
                };
            }

            async function handlePassthrough(
                req: IncomingMessage,
                res: ServerResponse,
                raw: string,
            ): Promise<void> {
                // Storybook does not inherit the app's own Vite `/rpc` proxy, so
                // the plugin routes to the configured target itself — which is
                // also the one place `storybook.target` takes effect.
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
                const body = Buffer.concat(chunks);
                const headers: Record<string, string> = {};
                for (const name of ['content-type', 'authorization', 'accept'] as const) {
                    const value = req.headers[name];
                    if (typeof value === 'string') headers[name] = value;
                }
                const upstream = await fetch(`${config.target}${raw}`, {
                    method: req.method ?? 'POST',
                    headers,
                    ...(body.length ? {body: new Uint8Array(body)} : {}),
                });
                res.writeHead(upstream.status, {
                    'content-type': upstream.headers.get('content-type') ?? 'application/json',
                });
                res.end(Buffer.from(await upstream.arrayBuffer()));
            }

            async function handleRpc(
                req: IncomingMessage,
                res: ServerResponse,
                raw: string,
            ): Promise<void> {
                if (req.method !== 'POST') {
                    sendJson(res, 405, {
                        jsonrpc: '2.0',
                        error: {code: -32600, message: 'POST only'},
                        id: null,
                    });
                    return;
                }
                const url = new URL(raw, 'http://localhost');
                const role = roleOf(req, url);
                let body: {params?: unknown; id?: unknown; jsonrpc?: string; method?: unknown} = {};
                try {
                    const text = await readBody(req);
                    body = text ? (JSON.parse(text) as typeof body) : {};
                } catch {
                    sendJson(res, 400, {
                        jsonrpc: '2.0',
                        error: {code: -32700, message: 'Invalid JSON body'},
                        id: null,
                    });
                    return;
                }
                const method = methodFromPath(url.pathname, body.method);
                const session = await sessionFor(role);
                await session.ensureFresh();
                const result = await session.call(method, body.params ?? {}, {
                    public: method.startsWith('login.'),
                });
                sendJson(res, 200, {
                    jsonrpc: body.jsonrpc ?? '2.0',
                    result: result === undefined ? null : result,
                    id: body.id ?? null,
                });
            }
        },
    };
}
