import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {PART_OF_LABEL, SUITE_SECRETS_LABEL} from '../../../apply.ts';
import {realmCommand} from '../../../bin/kustomizeCommand.ts';
import {SUITE_SECRETS_SECRET} from '../../../generator.ts';
import {
    generateBlobKey,
    generateCookieSecret,
    generateGatewayKeys,
    mergeSuiteSecrets,
    suiteSecretsConfig,
    suiteSecretsSecret,
} from '../../../orchestrator/controller/kustomizeSecretsEnsure.ts';

/**
 * server/test/test/testSuiteSecrets.ts — the Secret the suite's secret configuration lives in.
 *
 * The realm does not *hold* the keys, it names them: the tree is deterministic and a regenerated tree
 * must stay byte-identical, so the pair cannot be written into it, and a pair generated into git is
 * either a secret in a repository or a new pair on every run . What can be asserted without a
 * cluster is therefore the two halves the wiring depends on — that the generated pair is the material
 * the gateway reads, and that the CLI asks for it by the right name — while the creation itself is
 * exercised where a cluster is.
 *
 * What is new beside the pair is the *merge*: a Secret written by an earlier pass has to gain the
 * values it could not have known — the blob key — without rotating anything it already holds, because
 * a rotated key is a session every browser is holding and a blob nobody can read (`@@D-856`).
 *
 * Registered as the `test.secrets` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {kustomizeSecretsEnsure}}) => ({
    testSecrets: ({name = 'suite secrets'}: {name?: string} = {}) =>
        group(name)([
            async function thePairIsWrittenWhereASweepCanFindIt(assert: IAssert) {
                const secret = suiteSecretsSecret({
                    name: SUITE_SECRETS_SECRET,
                    namespace: 'shop',
                    suite: 'shop',
                    owner: {name: 'shop', uid: '9f1c2a'},
                    config: '{"gateway":{}}',
                });
                const metadata = secret.metadata as {
                    labels?: Record<string, string>;
                    ownerReferences?: Array<Record<string, string>>;
                };
                assert.equal(
                    metadata.labels?.[PART_OF_LABEL],
                    'shop',
                    'the pair carries the label a pass selects its objects by',
                );
                assert.equal(
                    metadata.labels?.[SUITE_SECRETS_LABEL],
                    'true',
                    'and the one that keeps a sweep from retiring it while the declaration exists',
                );
                // The owner reference *is* the removal rather than a promise of one: Kubernetes
                // deletes the Secret when the declaration it names goes, which is the half no pass
                // can do, because a pass stops running when the CR does .
                assert.deepEqual(
                    metadata.ownerReferences,
                    [
                        {
                            apiVersion: 'blong.feasible.one/v1alpha1',
                            kind: 'BlongDeployment',
                            name: 'shop',
                            uid: '9f1c2a',
                        },
                    ],
                    'and it is owned by the declaration it was written for',
                );
                // A registry pass reads no CR — the process *is* the suite — so there is no owner to
                // name, and the pair lives as long as the deployment does.
                const unowned = suiteSecretsSecret({
                    name: SUITE_SECRETS_SECRET,
                    namespace: 'shop',
                    config: '{"gateway":{}}',
                });
                assert.equal(
                    (unowned.metadata as {ownerReferences?: unknown}).ownerReferences,
                    undefined,
                    'while a pass that read no declaration claims no owner',
                );
            },

            async function theGeneratedPairIsWhatTheGatewayReads(assert: IAssert) {
                const keys = generateGatewayKeys();
                const sign = keys.sign as Record<string, unknown>;
                const encrypt = keys.encrypt as Record<string, unknown>;

                // The framework's committed development pair is the shape to match (`devKeys.ts`):
                // an EC/P-384 JWK per key, labelled with the algorithm and the use, and carrying the
                // private half — the gateway mints with the sign key, so a public-only pair would
                // verify nothing a process of the same suite had issued.
                assert.equal(sign.kty, 'EC', 'the sign key is an EC key');
                assert.equal(sign.crv, 'P-384', 'on P-384');
                assert.equal(sign.alg, 'ES384', 'labelled with the signing algorithm');
                assert.equal(sign.use, 'sig', 'and with its use');
                assert.ok(
                    typeof sign.d === 'string' && sign.d.length > 0,
                    'and it carries the private half, which is what signs a session',
                );
                assert.equal(
                    encrypt.alg,
                    'ECDH-ES+A256KW',
                    'the encrypt key names the key agreement',
                );
                assert.equal(encrypt.use, 'enc', 'and its use');
                assert.notEqual(
                    sign.d,
                    encrypt.d,
                    'two keys rather than one key used twice, which is the whole point of a pair',
                );
            },

            async function thePairTravelsAsTheDocumentRcReads(assert: IAssert) {
                // The Secret holds one key, `config`, and its value is an rc document. The two paths
                // in it are the two roles every pod has — the gateway it serves and the peer it
                // calls — and they hold the *same* pair, which is what makes one Secret per
                // namespace enough: a browser's session survives a restart and a second replica, and
                // a peer verifies with the key the gateway would have signed with (@@D-441).
                const keys = generateGatewayKeys();
                const document = JSON.parse(
                    suiteSecretsConfig({
                        gateway: keys,
                        blobKey: generateBlobKey(),
                        cookieSecret: generateCookieSecret(),
                    }),
                ) as {
                    gateway: {sign: unknown; encrypt: unknown};
                    remote: {client: {sign: unknown; encrypt: unknown}};
                };
                assert.deepEqual(
                    document.gateway.sign,
                    keys.sign,
                    'the serving role is configured with the pair',
                );
                assert.deepEqual(document.gateway.encrypt, keys.encrypt, 'both halves of it');
                assert.deepEqual(
                    document.remote.client.sign,
                    keys.sign,
                    'and the calling role reads the same pair',
                );
                assert.deepEqual(
                    document.remote.client.encrypt,
                    keys.encrypt,
                    'so one namespace shares one pair rather than two',
                );
            },

            async function theBlobKeyTravelsTheSameWay(assert: IAssert) {
                // A released process needs two more values, and it needs them from the same document:
                // the key its store encrypts with and the secret its read cookie is signed with
                // (`@@D-856`). Neither is an environment variable any more — one channel, one mount.
                const blobKey = generateBlobKey();
                const cookieSecret = generateCookieSecret();
                const document = JSON.parse(
                    suiteSecretsConfig({
                        gateway: generateGatewayKeys(),
                        blobKey,
                        cookieSecret,
                    }),
                ) as {
                    blob: {
                        blobDispatch: {crypto: {key: string}; cookie: {secret: string}};
                    };
                };
                assert.equal(
                    document.blob.blobDispatch.crypto.key,
                    blobKey,
                    'the store key is the one that was generated',
                );
                assert.equal(
                    blobKey.length,
                    64,
                    'and it is 32 bytes of hex, which is what aes-256-cbc takes',
                );
                assert.equal(
                    document.blob.blobDispatch.cookie.secret,
                    cookieSecret,
                    'the cookie secret travels beside it',
                );
                assert.ok(cookieSecret.length >= 22, 'and is long enough to sign with');
                return {done: true};
            },

            async function anOlderDocumentGainsOnlyWhatItLacks(assert: IAssert) {
                // The pass that ran before this change wrote the gateway pair and nothing else. Filling
                // in the blob key is the whole point of the merge; replacing the pair would log every
                // browser out, and a rotated blob key would make every stored file unreadable
                // (`@@D-856`).
                const gateway = generateGatewayKeys();
                const older = JSON.stringify({
                    gateway: {sign: gateway.sign, encrypt: gateway.encrypt},
                });
                const {config, added} = mergeSuiteSecrets(older, {
                    ...(JSON.parse(
                        suiteSecretsConfig({
                            gateway: generateGatewayKeys(),
                            blobKey: generateBlobKey(),
                            cookieSecret: generateCookieSecret(),
                        }),
                    ) as Record<string, unknown>),
                });
                const document = JSON.parse(config) as Record<string, unknown>;
                assert.deepEqual(
                    (document.gateway as {sign: unknown}).sign,
                    gateway.sign,
                    'the pair that was already there is kept',
                );
                assert.ok(
                    added.some(path => path.startsWith('blob.blobDispatch.crypto.key')),
                    'and the store key is added, named in the report',
                );
                assert.ok(
                    added.some(path => path.startsWith('blob.blobDispatch.cookie.secret')),
                    'with the cookie secret beside it',
                );
                assert.ok(
                    added.every(path => !path.startsWith('gateway.')),
                    'while nothing under the gateway pair is reported as added',
                );
                return {done: true};
            },

            async function aDocumentNobodyCanReadIsNotOverwritten(assert: IAssert) {
                // The Secret may be the deployment's own: a document this realm cannot parse is
                // reported rather than replaced, because replacing it would delete credentials this
                // realm never wrote.
                const {config, added} = mergeSuiteSecrets('not json at all', {gateway: {sign: {}}});
                assert.equal(config, 'not json at all', 'the document is left exactly as it was');
                assert.deepEqual(added, [], 'and nothing is claimed to have been added');
                return {done: true};
            },

            async function theRealmCliAsksForTheKeys(assert: IAssert) {
                const args = (positionals: string[], argv: Record<string, unknown> = {}) =>
                    // A handler call, not one of the CLI's local verbs: those name no method.
                    realmCommand({argv: argv as never, positionals}) as
                        | {method: string; params?: Record<string, unknown>}
                        | undefined;

                assert.equal(
                    args(['keys-ensure'], {namespace: 'shop'})?.method,
                    'kustomizeSecretsEnsure',
                    'the keys command names the ensure handler',
                );
                assert.deepEqual(
                    args(['keys-ensure'], {namespace: 'shop'})?.params,
                    {namespace: 'shop'},
                    'and passes the tenant it was given',
                );
                assert.deepEqual(
                    args(['keys-ensure'])?.params,
                    {},
                    'leaving the tenant to the realm config when it is not given',
                );
            },

            async function theEnsureRefusesWithoutSomewhereToWrite(
                assert: IAssert,
                {$meta}: {$meta: IMeta},
            ) {
                // A call that cannot make the keys answers rather than throws, and says which part
                // was missing: the caller that ignores the answer is the one that leaves a suite
                // without them. Nothing is configured here, so the namespace is the missing part.
                const nothingToWrite = (await kustomizeSecretsEnsure({}, $meta)) as {
                    name: string;
                    created: boolean;
                    reason?: string;
                };
                assert.equal(
                    nothingToWrite.name,
                    SUITE_SECRETS_SECRET,
                    'the Secret the generators mount is the one the handler writes',
                );
                assert.equal(nothingToWrite.created, false, 'and no key is claimed to be made');
                assert.match(
                    String(nothingToWrite.reason),
                    /no namespace/,
                    'and the refusal names the missing part, which here is where to write',
                );
            },
        ]),
}));
