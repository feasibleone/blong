/**
 * `blong-dev proxy` — curl-friendly MLE proxy in front of a Blong gateway.
 *
 * Stands between plain HTTP (curl) and the gateway's MLE-encrypted RPC
 * endpoint.  On startup it performs the MLE handshake and optionally the login
 * for a predefined user, then forwards each request encrypted to the gateway
 * and returns the decrypted result as plain JSON — no need to know the MLE
 * wire format.
 *
 * The gateway it fronts and the credentials it logs in with come from the same
 * file `blong-dev call` reads (`.blong_callrc`), so a person who configured a
 * server once gets both tools: `--server <alias>` picks one, and
 * `--target`/`--username`/`--password` override the file for a one-off.
 *
 * Two modes:
 *  - Pre-authenticated (default): logs in on startup with `--username` /
 *    `--password` (or `MLE_USERNAME` / `MLE_PASSWORD`), so every forwarded
 *    request is authenticated.
 *  - Manual login: pass `--no-login` to skip the startup login.  Login methods
 *    (`login.token.create`, `login.token.exchange`) are forwarded as public and
 *    the returned token is captured automatically — subsequent calls use it.
 *
 * Usage:
 *   blong-dev proxy [--server <alias>] [--port 8099] [--target http://localhost:8080]
 *                   [--username testAdmin] [--password testPassword]
 *   blong-dev proxy --no-login        # let login happen through the proxy
 *
 *   curl -s -X POST http://localhost:8099/gateway/bundle/find \
 *        -H 'content-type: application/json' -d '{"params":{"paging":{}}}'
 */
import {createMleSession, type IMleAuth, type IMleCallOptions} from '@feasibleone/blong-mle';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';

import {
    CALL_RC,
    credentialsOf,
    loadCallRc,
    plainOf,
    resolveServer,
    type ICallRc,
    type IResolvedServer,
} from '../callRc.ts';

/** A flag's value, or the environment variable that stands for it, or `undefined`. */
function flag(args: string[], name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return process.env[`MLE_${name.toUpperCase()}`];
}

/**
 * The gateway to front, from the file when it declares one and from the
 * traditional defaults otherwise — a proxy with no configuration still works
 * against a local run on 8080, which is what it always did.
 */
function serverOf(args: string[], rc: ICallRc): IResolvedServer {
    const alias = flag(args, 'server');
    const target = flag(args, 'target');
    if (alias || Object.keys(rc.server ?? {}).length) {
        return resolveServer(rc, {method: 'login.token.create', alias, target});
    }
    return {
        entry: {url: target ?? 'http://localhost:8080'},
        source: target ? '--target' : 'default',
    };
}

/** Derive the dotted method name from the request path (e.g. `/rpc/a/b/c` → `a.b.c`). */
function methodFromPath(path: string, bodyMethod?: unknown): string {
    if (typeof bodyMethod === 'string' && bodyMethod.includes('.')) return bodyMethod;
    const cleaned = path.replace(/^\/(rpc\/)?/, '').replace(/\/$/, '');
    return cleaned.split('/').filter(Boolean).join('.');
}

/** Login methods are pre-auth (handshake keys, no bearer). */
const isLoginMethod = (method: string): boolean => method.startsWith('login.token.');

/** The response of these methods is a token we should capture as the session. */
const isTokenMethod = (method: string): boolean =>
    method === 'login.token.create' || method === 'login.token.exchange';

/**
 * Forward a call whose params must travel in the clear.
 *
 * Kept here rather than in the session because it is the one path that does not
 * use the MLE session at all: a public route reads its params as plain JSON and
 * its authorization from the bearer token.
 */
async function sendPlain(
    target: string,
    method: string,
    params: unknown,
    token: string | undefined,
): Promise<unknown> {
    const url = target.replace(/\/+$/, '');
    const response = await fetch(`${url}/rpc/${method.replace(/\./g, '/')}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? {authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
    });
    const body = (await response.json()) as {result?: unknown; error?: {message?: unknown}};
    if (body.error) {
        const message = body.error.message;
        throw new Error(typeof message === 'string' ? message : JSON.stringify(body.error));
    }
    return body.result;
}

function sendJson(res: ServerResponse, status: number, payload: object): void {
    res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(payload));
}

export async function proxy(args: string[]): Promise<void> {
    const port = Number(flag(args, 'port') ?? '8099');
    const manualLogin = args.includes('--no-login');
    const rc = loadCallRc()?.config ?? {};
    let gateway: IResolvedServer;
    try {
        gateway = serverOf(args, rc);
    } catch (error) {
        process.stderr.write(`blong-dev proxy: ${(error as Error).message}\n`);
        process.exitCode = 1;
        return;
    }
    const target = gateway.entry.url;
    const fromFile = credentialsOf(rc, gateway.entry);
    const username = flag(args, 'username') ?? fromFile.username ?? 'testAdmin';
    const password = flag(args, 'password') ?? fromFile.password ?? 'testPassword';

    process.stdout.write(
        `[blong-dev proxy] gateway ${target} (${gateway.source})` +
            ` — configure servers and credentials in ${CALL_RC}\n`,
    );
    const session = await createMleSession({
        url: target,
        ...(manualLogin ? {} : {username, password}),
    });
    if (manualLogin) {
        process.stdout.write(
            `[blong-dev proxy] MLE handshake with ${target} done — manual login mode. ` +
                `POST login.token.create / login.token.exchange through the proxy to authenticate.\n`,
        );
    } else {
        process.stdout.write(`[blong-dev proxy] MLE login to ${target} as ${username}...\n`);
    }
    process.stdout.write(
        `[blong-dev proxy] ready on http://localhost:${port}  →  ${target} (user: ${
            manualLogin ? '(manual)' : username
        })\n`,
    );
    process.stdout.write(
        `[blong-dev proxy] try: curl -s -X POST http://localhost:${port}/subject/object/predicate ` +
            `-H 'content-type: application/json' -d '{"params":{...}}'\n`,
    );

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
            sendJson(res, 405, {jsonrpc: '2.0', error: {code: -32600, message: 'POST only'}});
            return;
        }
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body: {params?: unknown; id?: unknown; jsonrpc?: string; method?: unknown} = {};
        try {
            body = raw ? (JSON.parse(raw) as typeof body) : {};
        } catch {
            sendJson(res, 400, {
                jsonrpc: '2.0',
                error: {code: -32700, message: 'Invalid JSON body'},
            });
            return;
        }
        const method = methodFromPath(req.url ?? '', body.method);
        try {
            // A route the gateway serves without auth is not MLE-decoded, so a
            // body encrypted for it would reach the handler as an opaque string
            // (`@@F-710`). The file says which prefixes those are.
            if (plainOf(rc, method)) {
                const result = await sendPlain(
                    target,
                    method,
                    body.params ?? {},
                    session.auth?.access_token,
                );
                sendJson(res, 200, {
                    jsonrpc: body.jsonrpc ?? '2.0',
                    result: result === undefined ? null : result,
                    id: body.id ?? null,
                });
                return;
            }
            // Login methods travel as public (handshake keys, no bearer); the
            // returned token is captured so later calls authenticate.
            const publicCall = isLoginMethod(method);
            await session.ensureFresh();
            const result = await session.call(method, body.params ?? {}, {
                public: publicCall,
            } as IMleCallOptions);
            if (isTokenMethod(method) && result && typeof result === 'object') {
                const auth = result as Partial<IMleAuth>;
                if (typeof auth.access_token === 'string') {
                    session.setAuth(auth as IMleAuth);
                    process.stdout.write(
                        `[blong-dev proxy] ${method} → session captured (authenticated)\n`,
                    );
                }
            }
            sendJson(res, 200, {
                jsonrpc: body.jsonrpc ?? '2.0',
                result: result === undefined ? null : result,
                id: body.id ?? null,
            });
        } catch (error) {
            const message = (error as Error)?.message ?? String(error);
            sendJson(res, 200, {
                jsonrpc: body.jsonrpc ?? '2.0',
                error: {code: -32000, message},
                id: body.id ?? null,
            });
        }
    });

    server.listen(port, '0.0.0.0');
}
