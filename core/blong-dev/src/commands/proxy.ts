/**
 * `blong-dev proxy` — curl-friendly MLE proxy in front of a Blong gateway.
 *
 * Stands between plain HTTP (curl) and the gateway's MLE-encrypted RPC
 * endpoint.  On startup it performs the MLE handshake and optionally the login
 * for a predefined user, then forwards each request encrypted to the gateway
 * and returns the decrypted result as plain JSON — no need to know the MLE
 * wire format.
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
 *   blong-dev proxy [--port 8099] [--target http://localhost:8080]
 *                   [--username testAdmin] [--password testPassword]
 *   blong-dev proxy --no-login        # let login happen through the proxy
 *
 *   curl -s -X POST http://localhost:8099/gateway/bundle/find \
 *        -H 'content-type: application/json' -d '{"params":{"paging":{}}}'
 */
import {createMleClient, type IMleAuth, type IMleCallOptions} from '@feasibleone/blong-mle';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';

function arg(args: string[], name: string, fallback: string): string {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return process.env[`MLE_${name.toUpperCase()}`] ?? fallback;
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

function sendJson(res: ServerResponse, status: number, payload: object): void {
    res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(payload));
}

export async function proxy(args: string[]): Promise<void> {
    const port = Number(arg(args, 'port', '8099'));
    const target = arg(args, 'target', 'http://localhost:8080');
    const manualLogin = args.includes('--no-login');
    const username = arg(args, 'username', 'testAdmin');
    const password = arg(args, 'password', 'testPassword');

    const client = await createMleClient({
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
            // Login methods travel as public (handshake keys, no bearer); the
            // returned token is captured so later calls authenticate.
            const publicCall = isLoginMethod(method);
            const result = await client.call(method, body.params ?? {}, {
                public: publicCall,
            } as IMleCallOptions);
            if (isTokenMethod(method) && result && typeof result === 'object') {
                const auth = result as Partial<IMleAuth>;
                if (typeof auth.access_token === 'string') {
                    client.setAuth(auth as IMleAuth);
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
