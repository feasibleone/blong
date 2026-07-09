import type {FastifyInstance, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';

import jose from './jose.ts';

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
                const [where, what]: [Record<string, unknown>, string] = (
                    request.body?.jsonrpc ? [request.body, 'params'] : [request, 'body']
                ) as [Record<string, unknown>, string];
                if (where[what] && request.routeOptions.config.mle !== false) {
                    // Check if the body looks MLE-encrypted (GeneralJWE with recipients, or CompactJWE string)
                    const isEncrypted =
                        typeof where[what] === 'string' ||
                        (typeof where[what] === 'object' &&
                            where[what] !== null &&
                            'recipients' in (where[what] as object));
                    if (!isEncrypted) return; // Plain JSON body — skip MLE

                    const credentials = request.auth?.credentials;
                    try {
                        if (credentials?.mlsk === 'header' && credentials?.mlek === 'header') {
                            const {
                                protectedHeader: {mlsk, mlek},
                                plaintext,
                            } = (await mle.decrypt(where[what] as string, {complete: true})) as {
                                plaintext: string | Uint8Array;
                                protectedHeader: {mlek?: {type: string}; mlsk?: {type: string}};
                            };
                            credentials.mlsk = mlsk;
                            credentials.mlek = mlek;
                            where[what] = await mle.verify(
                                plaintext,
                                mlsk as unknown as Parameters<typeof mle.verify>[1],
                            );
                        } else if (credentials?.mlsk) {
                            where[what] = await mle.decryptVerify(
                                where[what] as string,
                                credentials.mlsk as Parameters<typeof mle.decryptVerify>[1],
                            );
                        } else {
                            // No credentials (e.g. auth: 'login') — extract keys from JWE header
                            const {
                                protectedHeader: {mlsk, mlek},
                                plaintext,
                            } = (await mle.decrypt(where[what] as string, {complete: true})) as {
                                plaintext: string | Uint8Array;
                                protectedHeader: {mlek?: {type: string}; mlsk?: {type: string}};
                            };
                            // Store mlek on request so preSerialization can encrypt the response
                            (request as {mleKeys?: {mlsk: unknown; mlek: unknown}}).mleKeys = {
                                mlsk,
                                mlek,
                            };
                            where[what] = await mle.verify(
                                plaintext,
                                mlsk as unknown as Parameters<typeof mle.verify>[1],
                            );
                        }
                    } catch (error) {
                        reply.code(400);
                        const newError = new Error('Decryption failed');
                        newError.cause = error instanceof Error ? error : String(error);
                        throw newError;
                    }
                }
            }
        },
    );
    fastify.addHook(
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
                      checkpoints?: unknown;
                  },
        ) => {
            if (payload instanceof Error) return payload;
            const mlek =
                request.auth?.credentials?.mlek ||
                (request as {mleKeys?: {mlek: unknown}}).mleKeys?.mlek;
            if (
                request.routeOptions.config.auth &&
                request.headers['content-type'] === 'application/json' &&
                payload &&
                mlek
            ) {
                const encrypt: (message: object) => unknown = message =>
                    request.routeOptions.config.mle === false
                        ? message
                        : mle.signEncrypt(
                              message,
                              mlek as {type: string},
                          );
                const where = payload.jsonrpc
                    ? payload
                    : {
                          result: payload,
                          id: undefined,
                          jsonrpc: undefined,
                          error: undefined,
                          checkpoints: undefined,
                      };
                let result,
                    error = undefined as string | undefined;
                const code = reply.statusCode.toString().slice(0, 1) + 'xx';
                if ('result' in where)
                    result = reply.serializeInput(
                        where.result as Record<string, unknown>,
                        code,
                    ) as string;
                if (payload.jsonrpc && 'error' in where)
                    error = reply.serializeInput(
                        payload.error as Record<string, unknown>,
                        code,
                    ) as string;
                reply.serializer(x => x);
                try {
                    return JSON.stringify({
                        id: where.id,
                        jsonrpc: where.jsonrpc,
                        result: result && (await encrypt(Buffer.from(result))),
                        error: error && (await encrypt(Buffer.from(error))),
                        checkpoints: where.checkpoints,
                    });
                } catch (error) {
                    reply.code(400);
                    throw error;
                }
            }
        },
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
