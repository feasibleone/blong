/**
 * The smallest static file server that can serve a Docusaurus build.
 *
 * `blong-dev docs verify` has to load the built site in a real browser, and a
 * Docusaurus build cannot be opened over `file://`: `baseUrl` is `/`, so every asset
 * is requested at an absolute path and none of them resolve. Something has to serve
 * the directory, and a dependency-free server of twenty lines is cheaper than making
 * the caller start `docusaurus serve` in a second terminal and keep it alive.
 *
 * It is deliberately not a general-purpose server: no range requests, no caching
 * headers, no directory listing. Its only caller is a verification run that already
 * knows exactly which pages it is going to ask for.
 */

import {createReadStream, existsSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, resolve, sep} from 'node:path';

/** Content types the build actually contains. Anything else is served as a download. */
const CONTENT_TYPES: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

/** A running server, and how to stop it. */
export interface IStaticServer {
    /** Origin to pass to the browser, e.g. `http://127.0.0.1:41234`. */
    origin: string;
    close: () => Promise<void>;
}

/** Whether `path` is an existing regular file. */
function isFile(path: string): boolean {
    return existsSync(path) && statSync(path).isFile();
}

/**
 * Resolve a request path to a file inside `root`, or undefined.
 *
 * Docusaurus writes `concepts/rbac.html` for the route `concepts/rbac`, so an
 * extension-less request falls back to `<path>.html` — that fallback is the whole
 * reason this is not just `path.join`.
 */
function resolveFile(root: string, pathname: string): string | undefined {
    // Decode first: a route with a space arrives percent-encoded, and joining the
    // encoded form would look for a file whose name contains the escapes.
    let decoded: string;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return undefined;
    }
    const candidate = resolve(root, `.${decoded}`);
    // Contain the request to `root`: `..` segments in a path must not escape it.
    if (candidate !== root && !candidate.startsWith(root + sep)) return undefined;

    if (isFile(candidate)) return candidate;
    if (isFile(join(candidate, 'index.html'))) return join(candidate, 'index.html');
    if (isFile(`${candidate}.html`)) return `${candidate}.html`;
    return undefined;
}

/**
 * Serve `root` on an ephemeral loopback port.
 *
 * Port 0 rather than a fixed one so two verification runs cannot collide, which also
 * means the caller must use the returned {@link IStaticServer.origin} rather than an
 * address it assumed.
 */
export async function serveStatic(root: string): Promise<IStaticServer> {
    const notFound = join(root, '404.html');
    const server = createServer((request, response) => {
        const pathname = (request.url ?? '/').split(/[?#]/)[0];
        const file = resolveFile(root, pathname);
        if (file === undefined) {
            response.writeHead(404, {'content-type': 'text/html; charset=utf-8'});
            if (isFile(notFound)) createReadStream(notFound).pipe(response);
            else response.end('not found');
            return;
        }
        response.writeHead(200, {
            'content-type':
                CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        });
        createReadStream(file).pipe(response);
    });

    await new Promise<void>((ready, failed) => {
        server.once('error', failed);
        server.listen(0, '127.0.0.1', ready);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        server.close();
        throw new Error('the static server did not report a port');
    }
    return {
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
            new Promise<void>((closed, failed) =>
                server.close(error => (error === undefined ? closed() : failed(error))),
            ),
    };
}
