/**
 * Grants: a short-lived token that asks for one capability, on one request.
 *
 * What matters here is that the mechanism is *narrow*: it verifies only what it
 * signed, honours only what it knows, and answers "no grant" — never an error —
 * for everything else, because it arrives on a header anybody can set.
 */
import {exportJWK, generateKeyPair, importJWK, SignJWT} from 'jose';
import t from 'tap';
import {devSignKey} from './devKeys.ts';
import {
    DEFAULT_TTL_SECONDS,
    granted,
    grantedCalls,
    grantKeyFrom,
    mintGrant,
    parseTtl,
    verifyGrant,
} from './grant.ts';

const secondsAgo = (seconds: number): number => Math.floor(Date.now() / 1000) - seconds;

t.test('a minted grant verifies, and carries only the capability it was asked for', async t => {
    const token = await mintGrant({cap: ['calls'], ttlSeconds: 60});
    const claims = await verifyGrant(token);
    t.equal(granted(claims, 'calls'), true, 'the capability is honoured');
    t.equal(claims?.cap.length, 1, 'and nothing else is claimed');
    t.ok((claims?.exp ?? 0) > secondsAgo(0), 'the expiry is in the future');
    t.end();
});

t.test('the default lifetime is minutes, not a session', async t => {
    t.equal(DEFAULT_TTL_SECONDS, 900);
    const claims = await verifyGrant(await mintGrant({cap: ['calls']}));
    const lifetime = (claims?.exp ?? 0) - (claims?.iat ?? 0);
    t.equal(
        lifetime,
        DEFAULT_TTL_SECONDS,
        'the token expires a quarter of an hour after it was minted',
    );
    t.end();
});

t.test('an expired grant is no grant', async t => {
    // Signed with a key this process does not hold, so the failure is the expiry
    // and not the signature: the token below is well-formed in every other way.
    const {privateKey} = await generateKeyPair('ES384', {extractable: true});
    const jwk = {...(await exportJWK(privateKey)), alg: 'ES384'};
    const expired = await new SignJWT({cap: ['calls']})
        .setProtectedHeader({alg: 'ES384'})
        .setIssuedAt(secondsAgo(120))
        .setExpirationTime(secondsAgo(60))
        .sign(await importJWK(jwk, 'ES384'));
    t.equal(
        await verifyGrant(expired, jwk),
        undefined,
        'a token that has expired verifies as nothing',
    );
    t.end();
});

t.test('a token signed by another key is refused', async t => {
    const {privateKey} = await generateKeyPair('ES384', {extractable: true});
    const other = {...(await exportJWK(privateKey)), alg: 'ES384'};
    const foreign = await mintGrant({cap: ['calls'], ttlSeconds: 60, key: other});
    t.equal(await verifyGrant(foreign), undefined, 'the framework key does not verify it');
    t.equal((await verifyGrant(foreign, other))?.cap.join(), 'calls', 'and its own key does');
    t.end();
});

t.test('a tampered or absent token is no grant, not an error', async t => {
    const token = await mintGrant({cap: ['calls'], ttlSeconds: 60});
    t.equal(await verifyGrant(`${token.slice(0, -3)}abc`), undefined, 'a mangled signature');
    t.equal(await verifyGrant('not-a-token'), undefined, 'nonsense');
    t.equal(await verifyGrant(''), undefined, 'an empty header');
    t.equal(await verifyGrant(undefined), undefined, 'and no header at all');
    t.end();
});

t.test('a capability this build does not know is dropped, not trusted', async t => {
    const claims = await verifyGrant(await mintGrant({cap: [], ttlSeconds: 60}));
    t.same(claims?.cap, [], 'an empty claim grants nothing');
    t.equal(granted(claims, 'calls'), false);
    t.equal(granted(undefined, 'calls'), false, 'and neither does a missing one');
    t.end();
});

t.test('minting without a private key says so', async t => {
    const {publicKey} = await generateKeyPair('ES384', {extractable: true});
    const publicOnly = {...(await exportJWK(publicKey)), alg: 'ES384'};
    await t.rejects(
        mintGrant({cap: ['calls'], key: publicOnly}),
        /no private half/,
        'a public key cannot sign, and the failure names why',
    );
    t.end();
});

t.test('a generated key verifies nothing rather than the development key', async t => {
    // A gateway that generated its own keys must not fall back to the committed
    // development key: that would accept a token anybody can mint with the
    // repository in hand.
    t.equal(
        await verifyGrant(await mintGrant({cap: ['calls']}), {generate: {alg: 'ES384'}}),
        undefined,
        'a key that exists only in the process that made it verifies no grant',
    );
    t.end();
});

t.test('the gateway verifies with the key it signs MLE with, unless one is named', t => {
    t.same(
        grantKeyFrom({sign: {env: 'GATEWAY_SIGN_KEY'}}),
        {env: 'GATEWAY_SIGN_KEY'},
        'the sign key by default',
    );
    t.same(
        grantKeyFrom({sign: {env: 'GATEWAY_SIGN_KEY'}, grant: {key: devSignKey}}),
        devSignKey,
        'gateway.grant.key wins when a deployment names one',
    );
    t.equal(grantKeyFrom({}), undefined, 'and no key at all means no verification');
    t.end();
});

t.test('a ttl reads the way a person writes one', t => {
    t.equal(parseTtl(undefined), DEFAULT_TTL_SECONDS, 'absent is the default');
    t.equal(parseTtl('45'), 45, 'a bare number is seconds');
    t.equal(parseTtl('45s'), 45);
    t.equal(parseTtl('15m'), 900);
    t.equal(parseTtl('2h'), 7200);
    t.throws(
        () => parseTtl('15 minutes'),
        /Unrecognized --ttl/,
        'anything else is refused, not guessed',
    );
    t.throws(() => parseTtl('0'), /at least a second/);
    t.end();
});

t.test('an env key that is not a JWK is reported rather than used', async t => {
    process.env['BLONG_TEST_GRANT_KEY'] = 'not json';
    t.teardown(() => delete process.env['BLONG_TEST_GRANT_KEY']);
    await t.rejects(mintGrant({cap: ['calls'], key: {env: 'BLONG_TEST_GRANT_KEY'}}), /valid JSON/);
    t.equal(
        await verifyGrant('anything', {env: 'BLONG_TEST_GRANT_KEY'}),
        undefined,
        'verification refuses it too',
    );
    t.end();
});

t.test('a grant asks for calls through the one seam the gateway uses', async t => {
    const token = await mintGrant({cap: ['calls'], ttlSeconds: 60});
    t.equal(await grantedCalls(token, undefined), true, 'a granted request asks for calls');
    t.equal(
        await grantedCalls(undefined, undefined),
        false,
        'a request with no grant asks for nothing',
    );
    t.equal(
        await grantedCalls('not-a-token', undefined),
        false,
        'and a tampered one asks for nothing',
    );
    const expired = await verifyGrant(await mintGrant({cap: ['calls'], ttlSeconds: 1}), undefined);
    t.ok((expired?.exp ?? 0) > 0, 'a short-lived token still verifies while it is live');
});
