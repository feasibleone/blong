import fastify from 'fastify';
import {test} from 'tap';

import {resolveGatewayPair} from './gatewayKeys.ts';
import mleCrypto from './jose.ts';
import mlePlugin, {type IConfig} from './mle.ts';

/** A key as the configuration carries it: material a reader can hand to jose. */
type Key = Record<string, unknown>;
/** The two halves one process shares, on either path (`gateway.*`, `remote.client.*`). */
type Pair = {sign?: Key; encrypt?: Key};

/**
 * The gateway and the rpc client are two components in one process, and the pair they resolve has to
 * be *one* pair: the gateway mints the bearer token, the client verifies it, and a process that
 * resolved two pairs — or none — answered every bearer request with jose's "Key must be one of type
 * CryptoKey, KeyObject, or JSON Web Key" (T-267).
 *
 * The pair is now resolved once, at load, into *both* paths, and that is what these tests hold: the
 * two readers end up with one pair, a client that was given its own keeps it, a process that serves
 * no gateway is untouched, and a descriptor that would make a pair per reader (`generate`) or per
 * read (`env`) is resolved exactly once.
 */
test('both readers are handed the same pair', async t => {
    const sign: Key = {kty: 'EC', d: 'sign'};
    const encrypt: Key = {kty: 'EC', d: 'encrypt'};
    const config: {gateway: Pair; remote: {client?: Pair}} = {gateway: {sign, encrypt}, remote: {}};
    t.equal(await resolveGatewayPair(config), false, 'nothing had to be generated');
    t.equal(config.remote.client?.sign, sign, 'the client verifies with the key the gateway signs');
    t.equal(config.remote.client?.encrypt, encrypt, 'and decrypts with the other half of the pair');
    t.end();
});

test('a pair that had to be generated is generated once', async t => {
    const config: {gateway: Pair; remote: {client?: Pair}} = {gateway: {}, remote: {}};
    t.equal(await resolveGatewayPair(config), true, 'the caller is told, so it can say so');
    // Material, not a descriptor: a `generate` spec left in place is resolved again by the client,
    // and the two readers then hold different keys — the defect this replaced a bridge for.
    t.equal(config.gateway.sign?.kty, 'EC', 'the sign half is a key');
    t.equal(config.gateway.sign?.alg, 'ES384', 'labelled with the signing algorithm');
    t.equal(
        config.gateway.encrypt?.alg,
        'ECDH-ES+A256KW',
        'and the encrypt half with the key agreement',
    );
    t.not(config.gateway.sign?.d, config.gateway.encrypt?.d, 'two keys rather than one used twice');
    t.equal(config.remote.client?.sign, config.gateway.sign, 'the client holds that same sign key');
    t.equal(config.remote.client?.encrypt, config.gateway.encrypt, 'and that same encrypt key');
    t.end();
});

test('a client slice that was already configured keeps what it holds', async t => {
    const tls = {ca: '/etc/ca.pem'};
    const own: Key = {kty: 'EC', d: 'client'};
    const config: {gateway: Pair; remote: {client: Pair & {tls?: unknown}}} = {
        gateway: {},
        remote: {client: {tls, sign: own}},
    };
    await resolveGatewayPair(config);
    t.same(config.remote.client.tls, tls, 'the transport settings beside the keys stay untouched');
    t.equal(config.remote.client.sign, own, 'and a pair the client was given wins');
    t.equal(
        config.remote.client.encrypt,
        config.gateway.encrypt,
        'while a half it was not given is filled from the gateway',
    );
    t.end();
});

test('a run with no gateway is left alone', async t => {
    const config: {remote: {client?: Pair}; gateway?: unknown} = {remote: {}};
    t.equal(await resolveGatewayPair(config), false, 'nothing to resolve, and nobody to warn');
    t.equal('client' in config.remote, false, 'nothing is added to a process that serves none');
    t.end();
});

test('a rebuilt gateway over the same source resolves the pair again', async t => {
    // A config change re-creates the gateway port (`Watch.ts`: the gateway implements no
    // `configChanged`), and the rebuilt component merges this source into its own config — so what the
    // plugin's write-back does to its copy must not reach the object a reload reads again.
    const config: {gateway: Pair; remote: {client?: Pair}} = {gateway: {}, remote: {}};
    t.equal(await resolveGatewayPair(config), true, 'the loader resolves the pair once');
    const resolved = config.gateway.sign;
    t.ok((resolved as {d?: unknown})?.d, 'as material, private half included');

    // First construction: the gateway merges into its own config, and the plugin writes the public
    // halves over that copy.
    const first = {...config.gateway, public: {}} as unknown as IConfig;
    const app = fastify();
    await app.register(mlePlugin, first);
    await app.close();
    t.notOk((first as {sign?: {d?: unknown}}).sign?.d, 'the first copy now holds the public half');

    // Reload: the port is created again and takes the source, which still holds what the loader put
    // there, so the crypto built from it can sign.
    t.equal(config.gateway.sign, resolved, 'the source still holds the resolved pair');
    const crypto = await mleCrypto({...config.gateway} as never);
    const signed = await crypto.signEncrypt(
        {hello: 'world'},
        config.gateway.encrypt as unknown as {type: string},
    );
    t.ok(signed, 'so a rebuilt instance can sign again');
    t.end();
});
