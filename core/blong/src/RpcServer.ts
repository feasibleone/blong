// import { DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import fastify, { type RouteOptions } from 'fastify';

import { internal } from '../types.js';
import type { Resolution } from './Resolution.js';

export interface RpcServer {
    register: (methods: object, namespace: string, reply: boolean, pkg: {version: string}) => void
    unregister: (methods: string[], namespace: string, reply: boolean) => void
    start: () => Promise<void>
    stop: () => Promise<void>
}

export default class RpcServerImpl extends internal implements RpcServer {
    #config = {
        port: 8091,
        host: '0.0.0.0',
        logLevel: 'info'
    };

    // #dapr: DaprServer;
    #server: ReturnType<typeof fastify>;
    #routes: RouteOptions[] = [];
    #resolution: Resolution;
    #handlers = new Map<string, {handle: RouteOptions['handler']}>();

    constructor(config, {log, resolution}) {
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
        super();
        this.merge(this.#config, config);
        this.#resolution = resolution;
        this.#server = fastify({
            logger: log?.child({name: 'rpc'}, {level: this.#config.logLevel})
        });
    }

    registerRoute(namespace: string, name: string, callback, object: object, {version: string}) {
        const url = `/rpc/${namespace}/${name.split('.').join('/')}`;
        async function handle(request, reply) {
            const {id, method, params} = request.body as {id: string, method: string, params: object[]};
            const meta = params.pop();
            const result = await callback.apply(object, [...params, {
                ...meta,
                method,
                // forward: forward(request.headers),
                opcode: method.split('.').pop()
            }]);
            return {
                jsonrpc: '2.0',
                id,
                result
            };
        }
        const prevHandler = this.#handlers.get(url);
        if (prevHandler) prevHandler.handle = handle;
        else {
            const handler = {handle};
            this.#handlers.set(url, handler);
            this.#routes.push({method: 'post', url, handler: (request, reply) => handler.handle(request, reply)});
        }
        this.#resolution?.announce('rpc-' + name.split('.')[0].replace(/\//g, '-'), this.#config.port);
    }

    register(methods: object, namespace: string, reply: boolean, pkg: {version: string}) {
        if (methods instanceof Array) {
            methods.forEach(fn => {
                if (fn instanceof Function && fn.name) {
                    this.registerRoute(namespace, fn.name, fn, null, pkg);
                }
            });
        } else {
            Object.keys(methods).forEach(key => {
                if (methods[key] instanceof Function) {
                    this.registerRoute(namespace, key, methods[key], methods, pkg);
                }
            });
        }
    }

    unregisterRoute(namespace: string, name: string) {
        const url = `/rpc/${namespace}/${name.split('.').join('/')}`;
        const prevHandler = this.#handlers.get(url);
        if (prevHandler) {
            prevHandler.handle = (request, reply) => {
                reply.code(404).type('text/plain').send('route removed');
            };
        }
    }

    unregister(methods: string[], namespace: string) {
        methods.forEach(fn => this.unregisterRoute(namespace, fn));
    }

    async start() {
        this.#routes.forEach(route => this.#server.route(route));
        await this.#server.listen({
            port: this.#config.port,
            host: this.#config.host
        });
    }

    async stop() {
        await this.#server.close();
    }
}
