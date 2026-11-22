import fastify from 'fastify';
import {test} from 'tap';

import {jsonRpcAnswer} from './gatewayAnswer.ts';
import mlePlugin, {type IConfig} from './mle.ts';

/**
 * An answer that carries nothing is still an answer (`@@D-956`).
 *
 * The framework's own history of this: a handler that returned nothing produced `result: undefined`,
 * which `JSON.stringify` drops — so the plain envelope arrived with no `result` key and the client's
 * codec threw `jsonrpcEmpty`, "JSON RPC response without response and error". The sealed envelope was
 * worse, because the serializer does not drop anything: an empty schema (what a permissive `result`
 * compiles to) renders an absent value as the four characters `undefined`, so the payload was not JSON
 * and a browser reported a parse error rather than an empty answer.
 *
 * Both shapes read one value, so both are pinned here: the body the gateway builds, once plain and
 * once through the sealing hook the gateway registers. The sealing route is mounted with `mle: false`
 * so the payload stays readable — the crypto is not what these tests are about, and making them open a
 * sealed frame would test jose rather than the answer.
 */

/** A pair for the plugin to hold, generated as a process with nothing configured would. */
const config = (): IConfig =>
    ({
        sign: {generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}},
        encrypt: {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
        public: {},
    }) as unknown as IConfig;

test('the answer body carries its result, even when there is nothing to carry', t => {
    const answer = jsonRpcAnswer({id: 7, result: undefined});
    t.equal(answer.result, null, 'an absent result is null, which is an answer');
    t.ok('result' in answer, 'and the key is there at all, which is what the client reads');
    t.equal(answer.id, 7, 'the id it answers is passed through');
    t.equal(
        JSON.parse(JSON.stringify(answer)).result,
        null,
        'so the serialized body still has a result, where it used to have none',
    );
    t.equal(
        JSON.parse(JSON.stringify({jsonrpc: '2.0', id: 7, result: undefined})).result,
        undefined,
        'which is not what a key holding undefined does — it disappears',
    );

    t.equal(
        jsonRpcAnswer({id: 1, result: 0}).result,
        0,
        'a falsy answer is not confused with none',
    );
    t.equal(jsonRpcAnswer({id: 1, result: false}).result, false, 'and neither is false');
    t.equal(jsonRpcAnswer({id: 1, result: ''}).result, '', 'nor an empty string');
    t.same(
        jsonRpcAnswer({id: 1, result: 1, progress: [{stage: 'half'}]}).progress,
        [{stage: 'half'}],
        'progress travels beside the result when the handler announced any',
    );
    t.notOk(
        'progress' in jsonRpcAnswer({id: 1, result: 1, progress: []}),
        'and not when it did not',
    );
    t.end();
});

test('a sealing route serializes an empty answer as null', async t => {
    const app = fastify();
    await app.register(mlePlugin, config());
    // A route of the shape the gateway declares: a result of no particular type, and a handler that
    // answered nothing. `mle: false` keeps the sealed payload in the clear, so what is asserted is the
    // serialization rule rather than a key agreement.
    app.route({
        method: 'POST',
        url: '/rpc/demo/entry/watch',
        config: {auth: true, mle: false},
        schema: {
            body: {type: 'object'},
            // The permissive result a `type.Unknown()` handler compiles to, and the status class the
            // hook serializes under — the key the gateway's own routes declare.
            response: {'2xx': {}},
        },
        preHandler: async request => {
            // The key agreement the sealing hook looks for; the answer itself is not encrypted.
            (request as {auth?: unknown}).auth = {credentials: {mlek: {kty: 'EC'}}};
        },
        handler: () => jsonRpcAnswer({id: 1, result: undefined}),
    });

    const answer = await app.inject({
        method: 'POST',
        url: '/rpc/demo/entry/watch',
        headers: {'content-type': 'application/json'},
        payload: {jsonrpc: '2.0', id: 1, method: 'demo.entry.watch', params: {}},
    });
    t.equal(answer.statusCode, 200, 'the route answers: ' + answer.body);
    // `mle: false` hands the serialized bytes through instead of sealing them, so the payload is the
    // JSON text a reader would otherwise have to open a frame to see.
    const {result} = answer.json() as {result: {data: number[]}};
    t.equal(
        Buffer.from(result.data).toString(),
        'null',
        'the payload the reader receives is the JSON text null',
    );
    t.not(
        Buffer.from(result.data).toString(),
        'undefined',
        'not the four characters an absent value renders as under an empty schema',
    );
    await app.close();
    t.end();
});
