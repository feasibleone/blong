import {Internal, type ILog} from '@feasibleone/blong/types';
import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';
import {spawn} from 'node:child_process';
import {
    copyFile,
    cp,
    mkdir,
    readdir,
    readFile,
    realpath,
    rename,
    rm,
    stat,
    unlink,
    writeFile,
} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {pipeline} from 'node:stream/promises';

interface IConfig {
    enabled: boolean;
    baseDir: string;
    routePrefix: string;
    maxFileSize: number;
    auth: false | 'jwt';
    shell: boolean;
}

interface IGatewayWithPlugins {
    registerPlugin(plugin: unknown, options?: unknown): void;
}

export default class RestFs extends Internal {
    #config: IConfig = {
        enabled: false,
        baseDir: process.cwd(),
        routePrefix: '/api/fs',
        maxFileSize: 52428800, // 50MB
        auth: false,
        shell: false,
    };

    #gateway: IGatewayWithPlugins;

    public constructor(
        config: IConfig,
        {log, gateway}: {log?: ILog; gateway?: IGatewayWithPlugins},
    ) {
        super({log});
        this.merge(this.#config, config);
        this.#gateway = gateway;
    }

    public async init(): Promise<void> {
        if (!this.#config.enabled || !this.#gateway) return;

        const config = this.#config;
        const baseDir = resolve(config.baseDir);

        await mkdir(baseDir, {recursive: true});

        const isWithinBase = (candidate: string): boolean => {
            if (candidate === baseDir) return true;
            const rel = relative(baseDir, candidate);
            return !rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith('..' + sep);
        };

        const resolveSafePath = async (requestPath: string): Promise<string> => {
            const joined = join(baseDir, requestPath || '/');
            const resolved = resolve(joined);
            if (!isWithinBase(resolved)) {
                const error = new Error('Access denied: path outside base directory');
                (error as NodeJS.ErrnoException).code = 'EACCES';
                throw error;
            }
            // Walk up to the nearest existing ancestor and realpath-check it
            // to prevent symlink-escape attacks on non-existent paths
            let check = resolved;
            let real: string | undefined;
            while (check !== baseDir) {
                try {
                    real = await realpath(check);
                    break;
                } catch (err) {
                    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                        check = dirname(check);
                        continue;
                    }
                    throw err;
                }
            }
            if (real && !isWithinBase(real)) {
                const error = new Error('Access denied: path outside base directory');
                (error as NodeJS.ErrnoException).code = 'EACCES';
                throw error;
            }
            // If the full path exists, return the realpath; otherwise the resolved path
            if (real && check === resolved) return real;
            return resolved;
        };

        const fsError = (
            reply: FastifyReply,
            err: unknown,
        ): FastifyReply => {
            const error = err as NodeJS.ErrnoException;
            switch (error.code) {
                case 'ENOENT':
                    return reply.code(404).send({error: 'Not found'});
                case 'EACCES':
                    return reply.code(403).send({error: error.message || 'Access denied'});
                case 'ENOTEMPTY':
                    return reply
                        .code(400)
                        .send({error: 'Directory not empty (use recursive=true)'});
                default:
                    return reply.code(500).send({error: error.message || 'Internal server error'});
            }
        };

        const authConfig = config.auth;

        const plugin = fp(
            async (server: FastifyInstance) => {
                const prefix = config.routePrefix;

                // Add raw body parser for octet-stream content
                server.addContentTypeParser(
                    'application/octet-stream',
                    {parseAs: 'buffer', bodyLimit: config.maxFileSize},
                    (_req, body, done) => {
                        done(null, body);
                    },
                );

                // GET /stat/* — file/directory metadata
                server.route({
                    method: 'GET',
                    url: `${prefix}/stat/*`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{Params: {'*': string}}>,
                        reply,
                    ) => {
                        try {
                            const fullPath = await resolveSafePath(request.params['*']);
                            const stats = await stat(fullPath);
                            return {
                                type: stats.isDirectory() ? 'directory' : 'file',
                                ctime: stats.ctimeMs,
                                mtime: stats.mtimeMs,
                                size: stats.size,
                            };
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // GET /readdir/* — directory listing
                server.route({
                    method: 'GET',
                    url: `${prefix}/readdir/*`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{Params: {'*': string}}>,
                        reply,
                    ) => {
                        try {
                            const fullPath = await resolveSafePath(request.params['*']);
                            const entries = await readdir(fullPath, {withFileTypes: true});
                            return entries.map(entry => ({
                                name: entry.name,
                                type: entry.isDirectory() ? 'directory' : 'file',
                            }));
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // POST /mkdir/* — create directory
                server.route({
                    method: 'POST',
                    url: `${prefix}/mkdir/*`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{Params: {'*': string}}>,
                        reply,
                    ) => {
                        try {
                            const fullPath = await resolveSafePath(request.params['*']);
                            await mkdir(fullPath, {recursive: true});
                            return {success: true};
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // GET /read/* — read file contents
                server.route({
                    method: 'GET',
                    url: `${prefix}/read/*`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{Params: {'*': string}}>,
                        reply,
                    ) => {
                        try {
                            const fullPath = await resolveSafePath(request.params['*']);
                            const content = await readFile(fullPath);
                            return reply.type('application/octet-stream').send(content);
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // POST /write/* — write file contents
                server.route({
                    method: 'POST',
                    url: `${prefix}/write/*`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{Params: {'*': string}}>,
                        reply,
                    ) => {
                        try {
                            const body = request.body;
                            if (!Buffer.isBuffer(body)) {
                                return reply.code(415).send({
                                    error: 'Unsupported media type: expected application/octet-stream',
                                });
                            }
                            const fullPath = await resolveSafePath(request.params['*']);
                            await mkdir(dirname(fullPath), {recursive: true});
                            await writeFile(fullPath, body);
                            return {success: true};
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // DELETE /delete/* — delete file or directory
                server.route({
                    method: 'DELETE',
                    url: `${prefix}/delete/*`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{
                            Params: {'*': string};
                            Querystring: {recursive?: string};
                        }>,
                        reply,
                    ) => {
                        try {
                            const fullPath = await resolveSafePath(request.params['*']);
                            const recursive = request.query.recursive === 'true';
                            const stats = await stat(fullPath);
                            if (stats.isDirectory()) {
                                await rm(fullPath, {recursive});
                            } else {
                                await unlink(fullPath);
                            }
                            return {success: true};
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // POST /rename — rename/move
                server.route({
                    method: 'POST',
                    url: `${prefix}/rename`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{Body: {oldPath: string; newPath: string}}>,
                        reply,
                    ) => {
                        try {
                            const {oldPath, newPath} = request.body;
                            const oldFullPath = await resolveSafePath(oldPath);
                            const newFullPath = await resolveSafePath(newPath);
                            await rename(oldFullPath, newFullPath);
                            return {success: true};
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // POST /copy — copy file or directory
                server.route({
                    method: 'POST',
                    url: `${prefix}/copy`,
                    config: {auth: authConfig},
                    handler: async (
                        request: FastifyRequest<{
                            Body: {source: string; destination: string};
                        }>,
                        reply,
                    ) => {
                        try {
                            const {source, destination} = request.body;
                            const sourceFullPath = await resolveSafePath(source);
                            const destFullPath = await resolveSafePath(destination);
                            const stats = await stat(sourceFullPath);
                            if (stats.isDirectory()) {
                                await cp(sourceFullPath, destFullPath, {recursive: true});
                            } else {
                                await copyFile(sourceFullPath, destFullPath);
                            }
                            return {success: true};
                        } catch (err) {
                            return fsError(reply, err);
                        }
                    },
                });

                // POST /shell — execute shell command with streaming output
                if (config.shell) {
                    server.route({
                        method: 'POST',
                        url: `${prefix}/shell`,
                        // Shell endpoint always requires auth when enabled
                        config: {auth: authConfig || 'jwt'},
                        handler: async (
                            request: FastifyRequest<{Body: {command: string; cwd?: string}}>,
                            reply,
                        ) => {
                            const {command, cwd} = request.body;
                            if (!command) {
                                return reply.code(400).send({error: 'Command is required'});
                            }

                            let workingDir: string;
                            try {
                                workingDir = cwd
                                    ? await resolveSafePath(cwd)
                                    : baseDir;
                            } catch {
                                return reply
                                    .code(400)
                                    .send({error: 'Invalid working directory'});
                            }

                            reply.raw.writeHead(200, {
                                'content-type': 'text/plain; charset=utf-8',
                                'transfer-encoding': 'chunked',
                                'cache-control': 'no-cache',
                                'x-content-type-options': 'nosniff',
                            });

                            const child = spawn(command, [], {
                                cwd: workingDir,
                                shell: true,
                                env: process.env,
                            });

                            request.raw.on('close', () => child.kill());

                            try {
                                await Promise.all([
                                    pipeline(child.stdout, reply.raw, {end: false}),
                                    pipeline(child.stderr, reply.raw, {end: false}),
                                    new Promise(resolve => child.on('close', resolve)),
                                ]);
                            } catch {
                                // Streaming error — client may have disconnected
                            } finally {
                                reply.raw.end();
                            }
                        },
                    });
                }
            },
            {name: 'rest-fs'},
        );

        this.#gateway.registerPlugin(plugin);
    }
}
