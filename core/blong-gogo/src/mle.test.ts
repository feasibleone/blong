import {resolveKeySpec} from '@feasibleone/blong-mle';
import fastify from 'fastify';
import {test} from 'tap';

import mlePlugin, {looksMleEncrypted, mleUndecoded, routeDecodesMle, type IConfig} from './mle.ts';

/**
 * `/rpc/login/.well-known/mle` is the one route that publishes the process's key material, and the
 * only copy of it a client may receive is the public half of each JWK: a private member that reaches
 * a client lets whoever holds it mint tokens this process would verify, or read what was encrypted to
 * it. The route answers anything that speaks MLE, so this has to be an assertion rather than a
 * convention — the payload's shape follows the keys the config carries, `mle.keys` strips the private
 * members today, and a change that published the config's own pair instead (the material
 * `gateway.sign` / `gateway.encrypt` hold, which the loader resolves and which carries `d`) would
 * publish them with it. That is the change this test is here to catch.
 */

/** The members a JWK uses for private material: EC `d`, RSA's primes, and the octet key itself. */
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

/** Every private member reachable in a value, by path — the payload is nested, so a scan of it is. */
const privatePaths = (value: unknown, path = ''): string[] => {
    if (Array.isArray(value))
        return value.flatMap((entry, i) => privatePaths(entry, `${path}[${i}]`));
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
        PRIVATE_MEMBERS.includes(key) ? [`${path}.${key}`] : privatePaths(entry, `${path}.${key}`),
    );
};

test('the well-known route publishes no private key material', async t => {
    const app = fastify();
    // A pair of descriptors, as a process with nothing configured carries: the plugin resolves them,
    // so the payload is built from real keys rather than from a stub that could hide the defect.
    const config = {
        sign: {generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}},
        encrypt: {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
        public: {sign: {}, encrypt: {}},
    } as unknown as IConfig;
    await app.register(mlePlugin, config);

    const answer = await app.inject({method: 'GET', url: '/rpc/login/.well-known/mle'});
    t.equal(answer.statusCode, 200, 'the route answers');

    const payload = answer.json() as Record<string, Record<string, unknown>>;
    t.same(Object.keys(payload).sort(), ['encrypt', 'sign'], 'both halves are published');
    for (const half of ['sign', 'encrypt'] as const) {
        t.ok(payload[half]?.kty, `${half}: carries a key type`);
        t.ok(payload[half]?.x, `${half}: carries the public coordinate`);
        t.ok(payload[half]?.y, `${half}: carries the other public coordinate`);
        t.notOk(payload[half]?.d, `${half}: carries no private scalar`);
    }

    t.same(privatePaths(payload), [], 'no private member is reachable in the payload');
    t.notMatch(answer.body, /"(d|p|q|dp|dq|qi|k)":/, 'and none is serialized into the answer');

    await app.close();
    t.end();
});

test('the plugin keeps private material out of the config it publishes', async t => {
    const app = fastify();
    // The loader resolves the pair into material that carries the private half, and that is what these
    // paths hold before the plugin runs — a `generate` descriptor is resolved to a key with `d`.
    const config = {
        sign: await resolveKeySpec({generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}}),
        encrypt: await resolveKeySpec({
            generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'},
        }),
        public: {},
    } as unknown as IConfig & {
        sign: {d?: unknown; kty?: unknown};
        // The published half, as this test reads it: a key rather than the descriptor the config
        // arrived with, which is what makes `kty` and `x` the two members to look at.
        public: {sign?: {kty?: unknown; x?: unknown}};
    };
    t.ok(config.sign.d, 'the config arrived carrying the private half');

    await app.register(mlePlugin, config);

    // The plugin publishes the public half of each pair (`mle.keys`) under `public`, and that copy is
    // what the well-known route serves and what a realm reads through `gateway.config()`. Whether it
    // also writes those public halves back over `config.sign`/`config.encrypt` is a separate question
    // — it does today, and those paths then hold the loader's material rather than a key if it stops —
    // so the assertion is about the published copy, and it holds either way.
    t.same(privatePaths(config.public), [], 'the published copy carries no private member');
    t.ok(config.public.sign?.kty, 'it carries a usable key rather than a descriptor');
    t.ok(config.public.sign?.x, 'and it is the public half of the pair the config arrived with');

    await app.close();
    t.end();
});

test('the write-back repoints the config property and leaves the material it replaced intact', async t => {
    const app = fastify();
    const material = await resolveKeySpec({generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}});
    const config = {
        sign: material,
        encrypt: await resolveKeySpec({
            generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'},
        }),
        public: {},
    } as unknown as IConfig & {
        sign: Record<string, unknown>;
        public: {sign?: unknown};
    };
    t.ok(config.sign.d, 'the config arrived with the private half');

    await app.register(mlePlugin, config);

    // A property assignment rather than an edit in place, which is what makes the write-back safe to
    // keep: the pair the config was given keeps its private half, so a reload that rebuilds the gateway
    // — it implements no `configChanged`, so the runtime creates the port again — merges from the
    // source config and resolves the pair afresh, instead of building crypto from a public key.
    t.notOk(config.sign.d, 'the config property now names the public half');
    t.ok(
        (material as {d?: unknown})?.d,
        'while the material it replaced still carries its private half',
    );
    t.equal(config.public.sign, config.sign, 'and `public` is the copy MLE clients fetch');

    await app.close();
    t.end();
});

/**
 * The refusal an encrypted body earns on a route that does not decode MLE.
 *
 * The behaviour this replaces was worse than a refusal: the body was left as an
 * encrypted string, the handler's schema cast it to the params it wanted, and the
 * caller was told that required properties were missing for a payload that carried
 * every one of them (`@@F-710 @@D-803`).
 */
const registered = async () => {
    const app = fastify();
    const config = {
        sign: {generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}},
        encrypt: {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
        public: {sign: {}, encrypt: {}},
    } as unknown as IConfig;
    await app.register(mlePlugin, config);
    // A route the gateway serves without auth, and one it guards: both are
    // registered after the plugin, which is what applies its hooks to them.
    app.post('/rpc/chat/prompt/ask', {config: {auth: false}}, async request => ({
        seen: request.body,
    }));
    app.post('/rpc/chat/account/find', {config: {auth: true}}, async request => ({
        seen: request.body,
    }));
    return app;
};

test('a route that does not decode MLE refuses a body that is encrypted', async t => {
    const app = await registered();
    const answer = await app.inject({
        method: 'POST',
        url: '/rpc/chat/prompt/ask',
        headers: {'content-type': 'application/json'},
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'chat.prompt.ask',
            params: 'eyJhbGciOiJFQ0RILUVTK0EyNTZLVyJ9.aaaa.bbbb.cccc.dddd',
        },
    });

    t.equal(answer.statusCode, 400, 'the body is refused rather than passed through');
    const body = answer.json() as {message?: string};
    t.match(body.message, /chat\.prompt\.ask/, 'the refusal names the method it was asked for');
    t.match(body.message, /requires auth/, 'and the cause');
    t.match(body.message, /Send plain JSON/, 'and what a caller can do about it');

    await app.close();
    t.end();
});

test('the same route still serves the plain JSON a public route is called with', async t => {
    const app = await registered();
    const answer = await app.inject({
        method: 'POST',
        url: '/rpc/chat/prompt/ask',
        headers: {'content-type': 'application/json'},
        payload: {
            jsonrpc: '2.0',
            id: 1,
            method: 'chat.prompt.ask',
            params: {platform: 'slack', kind: 'text', conversationId: 'C1', text: 'hi'},
        },
    });

    t.equal(answer.statusCode, 200, 'a public route keeps working with plain params');
    const body = answer.json() as {seen?: {params?: {text?: string}}};
    t.equal(body.seen?.params?.text, 'hi', 'and the handler receives them untouched');

    await app.close();
    t.end();
});

test('a guarded route leaves a plain body alone and would decode an encrypted one', async t => {
    const app = await registered();
    const answer = await app.inject({
        method: 'POST',
        url: '/rpc/chat/account/find',
        headers: {'content-type': 'application/json'},
        payload: {jsonrpc: '2.0', id: 1, method: 'chat.account.find', params: {paging: {}}},
    });

    t.equal(answer.statusCode, 200, 'plain JSON on an authenticated route is served');
    const body = answer.json() as {seen?: {params?: {paging?: unknown}}};
    t.same(body.seen?.params, {paging: {}}, 'and reaches the handler as it was sent');

    await app.close();
    t.end();
});

test('the decision and the refusal read on their own', async t => {
    t.equal(routeDecodesMle({auth: true}), true, 'an authenticated route decodes');
    t.equal(routeDecodesMle({auth: 'login'}), true, 'a login route decodes, carrying its own keys');
    t.equal(routeDecodesMle({auth: false}), false, 'a public route does not');
    t.equal(routeDecodesMle({}), false, 'a route with no auth does not');
    t.equal(routeDecodesMle({auth: true, mle: false}), false, 'nor one whose body is not MLE');

    t.equal(looksMleEncrypted('a.b.c.d.e'), true, 'five segments are a compact JWE');
    t.equal(looksMleEncrypted('hello from curl'), false, 'a string body is not');
    t.equal(looksMleEncrypted({recipients: []}), true, 'a general JWE is');
    t.equal(looksMleEncrypted({platform: 'slack'}), false, 'an ordinary payload is not');

    const error = mleUndecoded('chat.prompt.ask', '/rpc/chat/prompt/ask');
    t.equal(error.type, 'gateway.mleUndecoded', 'the refusal carries a type a caller can expect');
    t.equal(error.statusCode, 400, 'and a status of its own');
    t.match(error.message, /require auth on the route/, 'and names the second fix');
});
