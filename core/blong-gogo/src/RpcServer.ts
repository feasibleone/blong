// import { DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import {Internal, type ILog} from '@feasibleone/blong';
import fastify, {type FastifyReply, type FastifyRequest, type RouteOptions} from 'fastify';

import type {IResolution} from './Resolution.js';

export interface IRpcServer {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void;
    unregister: (methods: string[], namespace: string, reply: boolean) => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

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

    public constructor(config: IConfig, {log, resolution}: {log: ILog; resolution: IResolution}) {
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
        this.#server = fastify({
            logger: log?.child({name: 'rpc'}, {level: this.#config.logLevel}),
        });
    }

    private _register(
        namespace: string,
        name: string,
        callback: () => unknown,
        object: object,
        pkg: unknown
    ): void {
        const url = `/rpc/${namespace}/${name.split('.').join('/')}`;
        async function handle(request: FastifyRequest, reply: FastifyReply): Promise<object> {
            const {id, method, params} = request.body as {
                id: string;
                method: string;
                params: object[];
            };
            const meta = params.pop();
            const result = await callback.apply(object, [
                ...params,
                {
                    ...meta,
                    method,
                    // forward: forward(request.headers),
                    opcode: method.split('.').pop(),
                },
            ]);
            return {
                jsonrpc: '2.0',
                id,
                result,
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
            this.#config.port
        );
    }

    public register(
        methods: object,
        namespace: string,
        reply: boolean,
        pkg: {version: string}
    ): void {
        if (methods instanceof Array) {
            methods.forEach(fn => {
                if (fn instanceof Function && fn.name) {
                    this._register(namespace, fn.name, fn, null, pkg);
                }
            });
        } else {
            Object.keys(methods).forEach(key => {
                if (methods[key] instanceof Function) {
                    this._register(namespace, key, methods[key], methods, pkg);
                }
            });
        }
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

    public async start(): Promise<void> {
        this.#routes.forEach(route => this.#server.route(route));
        await this.#server.listen({
            port: this.#config.port,
            host: this.#config.host,
        });
    }

    public async stop(): Promise<void> {
        await this.#server.close();
    }
}
