import {handler, type IAssert, type IMeta} from '@feasibleone/blong';
import {createPublicKey, createVerify, type JsonWebKey} from 'node:crypto';

import {rememberMleHandshake} from '../../../mleHandshake.ts';
import {generateGatewayKeys} from '../../../orchestrator/controller/kustomizeGatewayKeysEnsure.ts';
import sessionHandlerFile from '../../../orchestrator/identity/identityCheckInternal.ts';
import sessionTokenMintFile from '../../../orchestrator/login/sessionTokenMint.ts';
import sessionConfigurationFile from '../../../orchestrator/session/sessionOidcGetConfiguration.ts';
import sessionKeysFile from '../../../orchestrator/session/sessionOidcGetKeys.ts';
import {publicSessionJwk, sessionKeyId} from '../../../sessionToken.ts';

type SessionReply = {
    'identity.check': {actorId: string; sessionId: string};
    permissionMap: string;
    mle?: {mlek: string; mlsk: string};
};

/** What the handler file gives when the framework builds it — the same call the loader makes. */
type SessionHandler = {
    identityCheckInternal: (params: object, $meta: IMeta) => Promise<SessionReply>;
};

/**
 * The mint as the framework builds it: the library factory, given the runtime it asks for.
 *
 * Built rather than reached through the proxy for the reason the identity handler is: a library the
 * test-side import resolves is a no-op there, and a test that cannot tell a mint from a no-op proves
 * nothing (F-495). The gateway is a stub whose `config()` answers the pair the realm's own generator
 * makes, which is the pair a deployment's rc file hands the process.
 */
const buildMint = async (session: {
    issuer?: string;
    audience?: string;
    expiresIn?: number;
}): Promise<{
    mint: (params: object) => Promise<string>;
    keys: {sign: JsonWebKey; encrypt: JsonWebKey};
    failures: string[];
}> => {
    const keys = generateGatewayKeys() as unknown as {sign: JsonWebKey; encrypt: JsonWebKey};
    const failures: string[] = [];
    const errors = new Proxy(
        {},
        {
            get:
                (_target: object, errorName: string) =>
                (params?: {params?: object}): Error => {
                    failures.push(errorName);
                    return new Error(`${errorName}: ${JSON.stringify(params?.params ?? {})}`);
                },
        },
    );
    const build = sessionTokenMintFile as unknown as (api: object) => {
        sessionTokenMint: (params: object, $meta?: IMeta) => Promise<string>;
    };
    const built = await build({
        config: {session: {...session, key: keys.sign}},
        errors,
    });
    return {mint: built.sessionTokenMint, keys, failures};
};

/** The claims of a compact JWS, as the gateway's verifier reads them back. */
const claimsOf = (token: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

/**
 * The handler as the framework builds it: the exported factory, called with the runtime it asks for.
 *
 * The group does not reach the handler through the proxy. A test handler calls `handler: {name}`, and
 * that resolution asks the registry for the name — which for `identityCheckInternal` is the method
 * `identity.check.internal`, a *three*-part name the port answers as `ports.identity.request`. What a
 * test-side import resolves to there is a no-op that answers `undefined`, and a test asserting a
 * refusal cannot tell that apart from a refusal that did not happen (F-495). The contract under test
 * is the handler's own, so it is built the way the loader builds it.
 */
const buildSession = (): {handler: SessionHandler; failures: string[]} => {
    const failures: string[] = [];
    const errors = new Proxy(
        {},
        {
            get:
                (_target: object, errorName: string) =>
                (params?: {params?: object}): Error => {
                    failures.push(errorName);
                    return new Error(`${errorName}: ${JSON.stringify(params?.params ?? {})}`);
                },
        },
    );
    const build = sessionHandlerFile as unknown as (api: {errors: object}) => SessionHandler;
    return {handler: build({errors}), failures};
};

/**
 * server/test/test/testSession.ts — the session a verified caller's calls are decrypted with.
 *
 * The framework asks `identity.checkInternal` for the keys a token's calls are signed with and
 * encrypted to, and reads the answer out of the packet a port returns — `[{ 'identity.check': … }]`,
 * the first element of `[value, $meta]`. That shape is the contract between the realm and the
 * framework, and neither side shows it on its own: the reader is `GatewayCodec.session`, the writer is
 * `orchestrator/identity/identityCheckInternal.ts`, and a mismatch between them appears only as
 * `Decryption failed` on a call three steps later. So the shape is pinned here, together with the
 * refusal a caller sees when its handshake is gone — that message is what an operator reads when a
 * page stops working after a restart. No cluster is needed: the handshake is remembered directly,
 * which is what the login handler does with a real one.
 *
 * Registered as the `test.session` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testSession: ({name = 'session'}: {name?: string} = {}) =>
        group(name)([
            async function refusesAnIdentityItNeverSaw(assert: IAssert) {
                const {handler, failures} = buildSession();
                const failure = await handler
                    .identityCheckInternal(
                        {username: 'system:serviceaccount:nowhere:nothing'},
                        {} as IMeta,
                    )
                    .then(
                        () => undefined,
                        (error: unknown) => error as Error,
                    );
                assert.ok(failure, 'an identity with no recorded handshake is refused');
                assert.deepEqual(
                    failures,
                    ['kustomize.sessionUnknown'],
                    'through the realm error that names the missing handshake',
                );
                return {};
            },

            async function handsBackTheKeysTheCallerLoggedInWith(assert: IAssert) {
                const {handler} = buildSession();
                const identity = 'system:serviceaccount:blong-system:blong-operator';
                // Shaped like the JWKs a caller generates, and deliberately not real keys: what is
                // under test is that the pair travels unchanged, not that it is well formed.
                const mlek = {kty: 'EC', use: 'enc', crv: 'P-384', kid: 'test-encrypt'};
                const mlsk = {kty: 'EC', use: 'sig', crv: 'P-384', kid: 'test-sign'};
                rememberMleHandshake(identity, {mlek, mlsk});

                const reply = await handler.identityCheckInternal(
                    {username: identity},
                    {} as IMeta,
                );
                assert.equal(
                    reply['identity.check'].actorId,
                    identity,
                    'and named by the identity the cluster gave it',
                );
                assert.deepEqual(
                    JSON.parse(reply.mle!.mlek),
                    mlek,
                    'the encrypt key comes back as the JSON the framework parses',
                );
                assert.deepEqual(
                    JSON.parse(reply.mle!.mlsk),
                    mlsk,
                    'and so does the sign key its calls are verified with',
                );
                return {};
            },

            async function theMintedSessionVerifiesAgainstThePublishedKey(assert: IAssert) {
                const identity = 'system:serviceaccount:blong-suite:default';
                const mlek = {kty: 'EC', use: 'enc', crv: 'P-384', kid: 'caller-encrypt'};
                const mlsk = {kty: 'EC', use: 'sig', crv: 'P-384', kid: 'caller-sign'};
                const {mint, keys} = await buildMint({
                    issuer: 'http://127.0.0.1:8080/rpc/session',
                    audience: 'blong',
                    expiresIn: 60,
                });

                // The name the caller logged in as, which is what tells two browsers apart: the key
                // pair travels inside the token, so nothing about the session is shared with another
                // login — the collision F-500 recorded was one slot per service account.
                const token = await mint({
                    username: 'blong-suite',
                    clusterUser: identity,
                    mlek,
                    mlsk,
                });
                const [header, payload, signature] = token.split('.');
                const claims = claimsOf(token);
                assert.equal(claims.sub, 'blong-suite', 'the subject is the name it logged in as');
                assert.equal(
                    claims.clusterUser,
                    identity,
                    'while the credential the cluster verified is kept beside it',
                );
                assert.deepEqual(claims.enc, mlek, 'the encrypt key travels in the token');
                assert.deepEqual(claims.sig, mlsk, 'and so does the sign key');
                assert.ok(
                    claims.ses,
                    'a session id is present, so the framework asks nobody for one',
                );
                assert.equal(
                    claims.iss,
                    'http://127.0.0.1:8080/rpc/session',
                    'and the issuer is the one the deployment configured',
                );
                assert.deepEqual(
                    JSON.parse(Buffer.from(header, 'base64url').toString()),
                    {alg: 'ES384', kid: sessionKeyId(keys.sign), typ: 'JWT'},
                    'the header names the algorithm and the key id the key set publishes',
                );
                // The one thing the framework will do with it: verify the signature against the public
                // half. Raw `R || S` is what JWS carries, which is what this has to produce.
                assert.equal(
                    createVerify('sha384')
                        .update(`${header}.${payload}`)
                        .verify(
                            {
                                key: createPublicKey({
                                    key: publicSessionJwk(keys.sign),
                                    format: 'jwk',
                                }),
                                dsaEncoding: 'ieee-p1363',
                            },
                            Buffer.from(signature, 'base64url'),
                        ),
                    true,
                    'and the signature verifies against the public half',
                );
                return {};
            },

            async function theKeySetPublishesTheSigningKeyAndNothingElse(assert: IAssert) {
                const failures: string[] = [];
                const errors = new Proxy(
                    {},
                    {
                        get:
                            (_target: object, errorName: string) =>
                            (params?: {params?: object}): Error => {
                                failures.push(errorName);
                                return new Error(
                                    `${errorName}: ${JSON.stringify(params?.params ?? {})}`,
                                );
                            },
                    },
                );
                const keys = generateGatewayKeys() as unknown as {sign: JsonWebKey};
                const build = sessionKeysFile as unknown as (api: object) => {
                    sessionOidcGetKeys: (params: object) => {keys: JsonWebKey[]};
                };
                const built = build({
                    gateway: {config: () => ({sign: keys.sign})},
                    errors,
                });
                const answer = built.sessionOidcGetKeys({});
                assert.equal(answer.keys.length, 1, 'one key, which is the one that signs');
                assert.equal(
                    answer.keys[0].kid,
                    sessionKeyId(keys.sign),
                    'named by the id a minted token carries, so a verifier finds it',
                );
                assert.equal(
                    (answer.keys[0] as {d?: unknown}).d,
                    undefined,
                    'and it is the public half: the private key never leaves the process',
                );
                assert.deepEqual(failures, [], 'with nothing refused along the way');
                return {};
            },

            async function theDiscoveryDocumentNamesItsOwnAddress(assert: IAssert) {
                // The one string that must not drift: the deployment configures `remote.openId` with
                // this document's URL and mints tokens whose `iss` is the issuer beside it, so a
                // document that named a different address would leave every minted token unresolvable
                // (F-494).
                const configuration =
                    'http://127.0.0.1:8080/rpc/session/.well-known/openid-configuration';
                const build = sessionConfigurationFile as unknown as (api: object) => {
                    sessionOidcGetConfiguration: (
                        params: object,
                        $meta: IMeta,
                    ) => {issuer: string; jwks_uri: string};
                };
                const answer = build({}).sessionOidcGetConfiguration({}, {
                    httpRequest: {url: configuration},
                } as unknown as IMeta);
                assert.equal(
                    answer.issuer,
                    'http://127.0.0.1:8080/rpc/session/',
                    'the issuer is the address the document was read from, without the document',
                );
                assert.equal(
                    answer.jwks_uri,
                    'http://127.0.0.1:8080/rpc/session/jwks',
                    'and the key set is answered beside it, where the session route declares it',
                );
                return {};
            },
        ]),
}));
