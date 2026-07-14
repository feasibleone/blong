// import { DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import {Internal, type ILog, type IManifest, type IMeta, type IRpcServer} from '@feasibleone/blong/types';
import fastify, {type FastifyReply, type FastifyRequest, type RouteOptions} from 'fastify';

import type {IResolution} from './Resolution.ts';

interface IConfig {
    port: number;
    host: string;
    logLevel: Parameters<ILog['logger']>[0];
}
export default class RpcServer extends Internal implements IRpcServer {
    #config: IConfig = {
        port: 8091,
        host: '0.0.0.0',
        logLevel: 'info',
    };

    // #dapr: DaprServer;
    #server: ReturnType<typeof fastify>;
    #routes: RouteOptions[] = [];
    #resolution: IResolution;
    #handlers: Map<string, {handle: RouteOptions['handler']}> = new Map();
    #attachCheckpoint?: (meta: IMeta) => void;
    #manifest: IManifest | undefined;

    public constructor(
        config: IConfig,
        {log, resolution, manifest}: {log: ILog; resolution: IResolution; manifest?: IManifest},
    ) {
        // https://docs.dapr.io/developing-applications/sdks/js/js-server/
        // this.#dapr = new DaprServer({
        //     serverHost: '127.0.0.1',
        //     serverPort: '50051',
        //     communicationProtocol: CommunicationProtocolEnum.HTTP,
        //     clientOptions: {
        //         daprHost: '127.0.0.1',
        //         daprPort: '3500'
        //     }
        // });
        super({log});
        this.merge(this.#config, config);
        this.#resolution = resolution;
        this.#manifest = manifest;
        this.#server = fastify({
            loggerInstance: log?.child({name: 'rpc'}, {level: this.#config.logLevel}),
        });
    }

    private _register(
        namespace: string,
        name: string,
        callback: () => unknown,
        object: object,
        _pkg: unknown,
    ): void {
        const url = `/rpc/${namespace}/${name.split('.').join('/')}`;
        const attachCheckpoint = this.#attachCheckpoint;
        async function handle(request: FastifyRequest, _reply: FastifyReply): Promise<object> {
            const {id, method, params} = request.body as {
                id: string;
                method: string;
                params: object[];
            };
            const meta = params.pop();
            const newMeta = {
                ...meta,
                method,
                // forward: forward(request.headers),
                opcode: method.split('.').pop(),
            };
            attachCheckpoint?.(newMeta as IMeta);
            const result = await (callback as (...args: unknown[]) => Promise<unknown>).apply(
                object,
                [...params, newMeta],
            );
            return {
                jsonrpc: '2.0',
                id,
                result,
                ...((newMeta as {checkpoints?: unknown[]}).checkpoints?.length && {
                    checkpoints: (newMeta as {checkpoints?: unknown[]}).checkpoints,
                }),
            };
        }
        const prevHandler = this.#handlers.get(url);
        if (prevHandler) prevHandler.handle = handle;
        else {
            const handler = {handle};
            this.#handlers.set(url, handler);
            this.#routes.push({
                method: 'post',
                url,
                handler: (request, reply) => handler.handle(request, reply),
            });
        }
        this.#resolution?.announce(
            'rpc-' + name.split('.')[0].replace(/\//g, '-'),
            this.#config.port,
        );
    }

    public register(
        methods: object,
        namespace: string,
        reply: boolean,
        pkg: {version: string},
    ): void {
        if (methods instanceof Array) {
            methods.forEach(fn => {
                if (fn instanceof Function && fn.name) {
                    this._register(namespace, fn.name, fn, null as unknown as object, pkg);
                }
            });
        } else {
            Object.keys(methods).forEach(key => {
                if ((methods as Record<string, unknown>)[key] instanceof Function) {
                    this._register(
                        namespace,
                        key,
                        (methods as Record<string, unknown>)[key] as () => unknown,
                        methods,
                        pkg,
                    );
                }
            });
        }
    }

    public setAttachCheckpoint(fn: ((meta: IMeta) => void) | undefined): void {
        this.#attachCheckpoint = fn;
    }

    private _unregister(namespace: string, name: string): void {
        const url = `/rpc/${namespace}/${name.split('.').join('/')}`;
        const prevHandler = this.#handlers.get(url);
        if (prevHandler) {
            prevHandler.handle = (request, reply) => {
                return reply.code(404).type('text/plain').send('route removed');
            };
        }
    }

    public unregister(methods: string[], namespace: string): void {
        methods.forEach(fn => this._unregister(namespace, fn));
    }

    public async start(): Promise<IRpcServer> {
        this.#routes.forEach(route => this.#server.route(route));
        await this.#server.listen({
            port: this.#config.port,
            host: this.#config.host,
        });
        // Publish the effective RPC port to the manifest.
        // The manifest proxy automatically resolves any pending deferred.
        const address = this.#server.server.address();
        if (this.#manifest && address && typeof address === 'object') {
            this.#manifest.rpcPort = address.port;
        }
        return this;
    }

    public async stop(): Promise<IRpcServer> {
        await this.#server.close();
        return this;
    }

    public info(): object {
        return {
            address: this.#server.server.address(),
        };
    }
}
