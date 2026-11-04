import fastifyStatic from '@fastify/static';
import Fastify, {
    type FastifyInstance,
    type FastifyReply,
    type FastifyRequest,
    type FastifyServerOptions,
} from 'fastify';
import fp from 'fastify-plugin';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {type ICachePolicy, cacheControlFor} from './cache.ts';
import {type IHeaderOptions, collectInlineHashes, securityHeaders} from './headers.ts';
import {baseWithoutSlash, normalizeBase, resolveRelativePath, toFileSystemPath} from './paths.ts';

/**
 * The asset server: a bundle directory, the prefix it answers under, and nothing else.
 *
 * Everything it needs is a file on disk — no registry, no configuration merge, no database — which
 * is what makes it safe to run beside a business process without carrying any of that process's
 * dependencies or rights. It reads the bundle once per request and caches only what it can prove is
 * immutable, so a deploy that replaces the directory is picked up on the next request.
 */
export interface IAssetServerOptions {
    /** The directory the build produced. It may be missing at startup (a volume is filled later). */
    root: string;
    /** The prefix the bundle answers under (default `/s/`). */
    base?: string;
    headers?: IHeaderOptions;
    cache?: ICachePolicy;
    /** Serve the package's own `favicon.ico` and `robots.txt` when the bundle has none. */
    builtIns?: boolean;
    /** Redirect `/` to the bundle's base. Default true. */
    redirectRoot?: boolean;
    /** Answer an unmatched path under the base with `index.html`. Default true. */
    spaFallback?: boolean;
    /** Trust `X-Forwarded-*`, which is what makes HSTS apply behind an ingress. Default true. */
    trustProxy?: boolean;
    logger?: FastifyServerOptions['logger'];
}

/** What a started server hands back: the instance, the address it listens on, and how to stop it. */
export interface IAssetServerHandle {
    server: FastifyInstance;
    url: string;
    close: () => Promise<void>;
}

const isFile = (path: string): boolean => {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
};

/** Whether a request is a navigation a single-page app should answer with its shell. */
const wantsShell = (request: FastifyRequest, relativePath: string): boolean => {
    const accept = request.headers.accept ?? '';
    if (!accept.includes('text/html')) return false;
    const last = relativePath.split('/').pop() ?? '';
    // A missing file with an extension is a broken link, not a client-side route: answering it with
    // HTML would turn a failed module load into a MIME error three layers away.
    return relativePath === '' || !last.includes('.');
};

/**
 * The routes, as a plugin the framework's own development serve could register.
 *
 * A plugin rather than only a factory because the two processes that serve a bundle differ in who
 * owns the server: the CLI owns its own, while `blong-gogo` may one day want these routes on the
 * gateway it already has. Registering the same plugin either way keeps one behaviour.
 */
export const assetPlugin = fp<IAssetServerOptions>(
    async (fastify: FastifyInstance, options: IAssetServerOptions) => {
        const base = normalizeBase(options.base ?? '/s/');
        // `@fastify/static` refuses a relative root, and a caller naming `dist` is a reasonable
        // thing to do: the working directory is the process's own, and resolving it here is the
        // one place that knows the plugin's requirement.
        const root = resolve(options.root);
        const baseAddress = baseWithoutSlash(base);
        const ready = (): boolean => existsSync(root);

        if (!ready()) {
            // A root that is not there is a deploy whose volume is not filled yet, or a suite with
            // no browser build: the server has to come up either way, because a pod that refuses to
            // start over a page nobody asked for is an API outage in disguise.
            fastify.log.warn({root}, 'no bundle at the configured root: /s is not served yet');
        }

        await fastify.register(fastifyStatic, {
            root,
            // The plugin's own routes are off: they would serve `index.html` for a directory and
            // answer a missing file with a bare 404, and both are decisions this file makes — the
            // shell fallback for a client-side route, and a policy for every answer including a 404.
            serve: false,
            preCompressed: true,
            cacheControl: false,
            etag: true,
            lastModified: true,
            index: ['index.html'],
            dotfiles: 'deny',
            serveDotFiles: false,
        });

        /** Hashes of the shell's inline blocks, read lazily and only when the shell changes. */
        let shellHashes: {scriptHashes: string[]; styleHashes: string[]} | undefined;
        let shellHashesAt: number | undefined;
        const inlineHashes = (): {scriptHashes: string[]; styleHashes: string[]} => {
            const indexPath = join(root, 'index.html');
            try {
                const {mtimeMs} = statSync(indexPath);
                if (shellHashes && shellHashesAt === mtimeMs) return shellHashes;
                shellHashes = collectInlineHashes(readFileSync(indexPath, 'utf8'));
                shellHashesAt = mtimeMs;
                return shellHashes;
            } catch {
                return {scriptHashes: [], styleHashes: []};
            }
        };

        const send = (
            request: FastifyRequest,
            reply: FastifyReply,
            relativePath: string,
            isHtml: boolean,
            cacheControl = cacheControlFor(relativePath, options.cache),
        ): FastifyReply => {
            const hashes = isHtml ? inlineHashes() : {scriptHashes: [], styleHashes: []};
            const origin = request.headers.origin;
            reply.header('cache-control', cacheControl);
            reply.headers(
                securityHeaders(options.headers, {
                    isHtml,
                    isHttps: request.protocol === 'https',
                    origin: typeof origin === 'string' ? origin : undefined,
                    inlineScriptHashes: hashes.scriptHashes,
                    inlineStyleHashes: hashes.styleHashes,
                }),
            );
            return reply.sendFile(relativePath);
        };

        /**
         * A miss, with the headers a resource answer carries.
         *
         * A 404 is not a page, so it gets the resource set rather than the document policies — but
         * it still gets them, because a server-header list that only covers hits is a list an
         * attacker reads the misses out of, and a 404 body must not be sniffed into something
         * executable either.
         */
        const notFound = (
            request: FastifyRequest,
            reply: FastifyReply,
            message: string,
        ): FastifyReply => {
            const origin = request.headers.origin;
            reply.headers(
                securityHeaders(options.headers, {
                    isHtml: false,
                    isHttps: request.protocol === 'https',
                    origin: typeof origin === 'string' ? origin : undefined,
                }),
            );
            reply.header('cache-control', 'no-store');
            return reply.code(404).type('text/plain').send(message);
        };

        /** A file the package carries itself, used only when the bundle does not have one. */
        const builtIn = (
            request: FastifyRequest,
            reply: FastifyReply,
            name: string,
        ): FastifyReply => {
            if (isFile(join(root, name))) return send(request, reply, name, false);
            if (options.builtIns === false) return notFound(request, reply, `not found: ${name}`);
            reply.header('cache-control', 'public, max-age=3600');
            reply.headers(
                securityHeaders(options.headers, {
                    isHtml: false,
                    isHttps: request.protocol === 'https',
                    origin:
                        typeof request.headers.origin === 'string'
                            ? request.headers.origin
                            : undefined,
                }),
            );
            return reply.sendFile(name, import.meta.dirname);
        };

        fastify.get('/healthz', async (_request, reply) => {
            reply.header('cache-control', 'no-store');
            return {status: 'ok'};
        });

        fastify.get('/readyz', async (_request, reply) => {
            reply.header('cache-control', 'no-store');
            // Readiness is the bundle being there, not the process being alive: a pod that answers
            // `/s/` with a 404 while its volume is still being filled is a deploy that looks healthy
            // and serves nothing.
            if (!ready()) return reply.code(503).send({status: 'not-ready', root});
            return {status: 'ready'};
        });

        fastify.get('/favicon.ico', async (request, reply) =>
            builtIn(request, reply, 'favicon.ico'),
        );
        fastify.get('/robots.txt', async (request, reply) => builtIn(request, reply, 'robots.txt'));

        if (options.redirectRoot !== false) {
            fastify.get('/', async (_request, reply) => reply.redirect(base, 308));
        }

        if (baseAddress !== base && baseAddress !== '/') {
            fastify.get(baseAddress, async (_request, reply) => reply.redirect(base, 308));
        }

        fastify.get(`${base}*`, async (request, reply) => {
            const target = resolveRelativePath(base, request.url);
            if (!target) {
                // A path that leaves the root is refused before it is normalised, so the answer
                // does not depend on what the filesystem would have done with it.
                return notFound(request, reply, 'not found');
            }
            const relativePath = target.directory
                ? join(target.relativePath, 'index.html').split('\\').join('/')
                : target.relativePath;
            const filePath = toFileSystemPath(root, relativePath);
            if (filePath && isFile(filePath)) {
                return send(request, reply, relativePath, relativePath.endsWith('.html'));
            }
            if (options.spaFallback !== false && wantsShell(request, target.relativePath)) {
                const indexPath = toFileSystemPath(root, 'index.html');
                if (indexPath && isFile(indexPath)) return send(request, reply, 'index.html', true);
            }
            return notFound(request, reply, 'not found');
        });

        fastify.setNotFoundHandler(async (request, reply) => notFound(request, reply, 'not found'));
    },
    {name: 'blong-asset'},
);

/** Build a server without listening: the caller decides when, and on what. */
export const createAssetServer = async (options: IAssetServerOptions): Promise<FastifyInstance> => {
    const app = Fastify({
        logger: options.logger ?? false,
        // The server always runs behind an ingress in a deployment, and a request's own idea of
        // whether it was TLS is the only thing an HSTS header can be based on.
        trustProxy: options.trustProxy ?? true,
        bodyLimit: 1024,
    });
    await app.register(assetPlugin, options);
    await app.ready();
    return app;
};

/**
 * Build and listen, which is what the CLI and a generated Deployment ask for.
 *
 * The address is returned rather than printed by the caller, because the port may be `0` (a test, a
 * sidecar): the one that was actually bound is the only useful answer.
 */
export const startAssetServer = async (
    options: IAssetServerOptions & {host?: string; port?: number},
): Promise<IAssetServerHandle> => {
    const app = await createAssetServer({
        ...options,
        // A static server answers every file a page names, so request logging at `info` is a line
        // per script: `warn` is the level a deployment wants, and `--log-level` is how a person
        // watching one raises it.
        logger: options.logger ?? {level: 'warn'},
    });
    const host = options.host ?? '0.0.0.0';
    const port = options.port ?? 8080;
    await app.listen({host, port});
    const address = app.server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    return {
        server: app,
        url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${boundPort}${normalizeBase(
            options.base ?? '/s/',
        )}`,
        close: () => app.close(),
    };
};
