import type {ITypedError} from '@feasibleone/blong/types';
import type {FastifyInstance, FastifyRequest} from 'fastify';
import fp from 'fastify-plugin';

import jose from './jose.ts';
import isPublic from './public.ts';

export type IConfig = Parameters<typeof jose>[0] & {public: {sign: unknown; encrypt: unknown}};

/** What the hook needs to know about a route: both fields are the route's own fastify config. */
export interface IRouteDecision {
    auth?: unknown;
    mle?: unknown;
}

/**
 * Whether the gateway decodes MLE params on a route.
 *
 * Two settings answer it and both have to say yes: a route served without auth
 * (`auth: false`) never reaches the decode, and neither does one that declares
 * `mle: false` because its body is somebody else's format. A route that does not
 * decode is a route an encrypted body passes straight through (`@@D-803`).
 */
export function routeDecodesMle(config?: IRouteDecision): boolean {
    if (!config) return false;
    return Boolean(config.auth) && config.mle !== false;
}

/**
 * Whether a request value is an MLE body rather than the caller's params.
 *
 * A General JWE is an object carrying `recipients` or a `ciphertext`; a compact
 * one is five dot-separated segments. The count is what keeps this apart from a
 * route that legitimately takes a string, which the looser test in the decode
 * path below would treat as encrypted (`@@F-710`).
 */
export function looksMleEncrypted(value: unknown): boolean {
    if (typeof value === 'string') return value.split('.').length === 5;
    if (!value || typeof value !== 'object') return false;
    return 'recipients' in value || 'ciphertext' in value;
}

/**
 * The refusal a route that does not decode gives an encrypted body.
 *
 * The alternative is what the framework used to do: leave the body as an
 * encrypted string, cast it to the params the schema wants, and report the
 * required properties as missing — for a payload that carried every one of them.
 * That error names the payload, which is innocent, and hides the route, which is
 * not (`@@F-710 @@D-803`). A typed error with a status of its own is also what a
 * caller can declare in `expect`.
 *
 * Declared here rather than in the gateway's `errorMap` because this plugin never
 * receives the gateway's error factory: its config is the gateway's own, and the
 * factory is not part of it.
 */
export function mleUndecoded(method: string, path: string): ITypedError {
    const error = new Error(
        `Encrypted params on "${method}" (${path}): the gateway decodes MLE only where the route ` +
            `requires auth, so this body would reach the handler unreadable. Send plain JSON, or ` +
            `require auth on the route.`,
    ) as ITypedError;
    Object.assign(error, {type: 'gateway.mleUndecoded', statusCode: 400});
    return error;
}

export default fp<IConfig>(async function mlePlugin(fastify: FastifyInstance, config: IConfig) {
    const mle = await jose(config);
    if (config) {
        // Why these four lines are here, and why they are safe. `mle.keys` is the *public* half of the
        // pair (`core/blong-mle/src/crypto.ts`: "`keys` exposes the PUBLIC JWKs (for handshakes);
        // `signEncrypt`/`decryptVerify` are bound to this instance's private keys"), while the pair the
        // loader resolves onto `gateway.sign`/`gateway.encrypt` carries the private half — so writing
        // the public JWKs here is what keeps private material out of configuration as such, which a
        // diagnostic, a `/api/sys/config` snapshot and a realm calling `gateway.config()` all read.
        // Signing never needs a config path: this plugin's own crypto instance holds the private keys,
        // so replacing the config's copy costs nothing (T-267, D-441). And the replacement is a
        // property on the gateway's own `#config` — a class field the incoming config is merged into,
        // not the merged snapshot — so a reload that rebuilds the gateway merges from the source and
        // resolves the pair again; the write-back cannot leave a process unable to sign (D-448).
        config.sign = mle.keys.sign;
        config.encrypt = mle.keys.encrypt;
        config.public.sign = mle.keys.sign;
        config.public.encrypt = mle.keys.encrypt;
    }
    fastify.addHook(
        'preValidation',
        async (request: FastifyRequest<{Body: {jsonrpc?: string; method?: string}}>, reply) => {
            if (isPublic(request.originalUrl)) return;
            if (request.headers['content-type'] !== 'application/json') return;
            const [where, what]: [Record<string, unknown>, string] = (
                request.body?.jsonrpc ? [request.body, 'params'] : [request, 'body']
            ) as [Record<string, unknown>, string];
            if (!where[what]) return;
            if (!routeDecodesMle(request.routeOptions.config)) {
                // A route that does not decode MLE cannot use an encrypted body,
                // and passing it through is what makes the handler blame the
                // payload for properties it was carrying (`@@D-803`). The
                // request is refused with the cause instead.
                if (looksMleEncrypted(where[what])) {
                    const method =
                        typeof request.body?.method === 'string'
                            ? request.body.method
                            : request.originalUrl;
                    throw mleUndecoded(method, request.originalUrl);
                }
                return;
            }
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
                      progress?: unknown;
                  },
        ) => {
            if (isPublic(request.originalUrl)) return payload;
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
                        : mle.signEncrypt(message, mlek as {type: string});
                const where = payload.jsonrpc
                    ? payload
                    : {
                          result: payload,
                          id: undefined,
                          jsonrpc: undefined,
                          error: undefined,
                          progress: undefined,
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
                        progress: where.progress,
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
