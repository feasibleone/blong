import type {FastifyInstance, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';

import jose from './jose.js';

export type IConfig = Parameters<typeof jose>[0] & {public: {sign: unknown; encrypt: unknown}};

export default fp<IConfig>(async function mlePlugin(fastify: FastifyInstance, config: IConfig) {
    const mle = await jose(config);
    if (config) {
        config.public.sign = mle.keys.sign;
        config.public.encrypt = mle.keys.encrypt;
    }
    fastify.addHook(
        'preValidation',
        async (request: FastifyRequest<{Body: {jsonrpc?: string}}>, reply) => {
            if (
                request.routeOptions.config.auth &&
                request.headers['content-type'] === 'application/json'
            ) {
                const [where, what] = request.body?.jsonrpc
                    ? [request.body, 'params']
                    : [request, 'body'];
                if (where[what] && request.routeOptions.config.mle !== false) {
                    const credentials = request.auth?.credentials;
                    if (!credentials) {
                        reply.code(401); // eslint-disable-line @typescript-eslint/no-floating-promises
                        throw new Error('Missing authorization');
                    }
                    try {
                        if (credentials.mlsk === 'header' && credentials.mlek === 'header') {
                            const {
                                protectedHeader: {mlsk, mlek},
                                plaintext,
                            } = (await mle.decrypt(where[what], {complete: true})) as {
                                plaintext: string | Uint8Array;
                                protectedHeader: {mlek?: {type: string}; mlsk?: {type: string}};
                            };
                            credentials.mlsk = mlsk;
                            credentials.mlek = mlek;
                            where[what] = await mle.verify(plaintext, mlsk);
                        } else {
                            where[what] = await mle.decryptVerify(where[what], credentials.mlsk);
                        }
                    } catch (error) {
                        reply.code(400); // eslint-disable-line @typescript-eslint/no-floating-promises
                        throw new Error('Decryption failed');
                    }
                }
            }
        }
    );
    fastify.addHook<unknown, unknown, {auth: unknown; mle: unknown}>(
        'preSerialization',
        async (
            request,
            reply,
            payload:
                | Error
                | {
                      id?: unknown;
                      jsonrpc?: unknown;
                      result?: Record<string, unknown>;
                      error?: Record<string, unknown>;
                  }
        ) => {
            if (payload instanceof Error) return payload;
            if (
                request.routeOptions.config.auth &&
                request.headers['content-type'] === 'application/json' &&
                payload
            ) {
                const encrypt: (message: object) => unknown = message =>
                    request.routeOptions.config.mle === false
                        ? message
                        : mle.signEncrypt(
                              message,
                              request.auth?.credentials?.mlek as {type: string}
                          );
                const where = payload.jsonrpc
                    ? payload
                    : {result: payload, id: undefined, jsonrpc: undefined};
                let result, error: string;
                const code = reply.statusCode.toString().slice(0, 1) + 'xx';
                if ('result' in where) result = reply.serializeInput(where.result, code) as string;
                if (payload.jsonrpc && 'error' in where)
                    error = reply.serializeInput(payload.error, code) as string;
                reply.serializer(x => x); // eslint-disable-line @typescript-eslint/no-floating-promises
                try {
                    return JSON.stringify({
                        id: where.id,
                        jsonrpc: where.jsonrpc,
                        result: result && (await encrypt(Buffer.from(result))),
                        error: error && (await encrypt(Buffer.from(error))),
                    });
                } catch (error) {
                    reply.code(400); // eslint-disable-line @typescript-eslint/no-floating-promises
                    throw error;
                }
            }
        }
    );
    fastify.route({
        method: 'GET',
        url: '/rpc/login/.well-known/mle',
        config: {auth: false},
        handler() {
            return config.public;
        },
    });
});
