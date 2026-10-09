import {type IAssert, type IMeta, handler} from '@feasibleone/blong';
import {realmCommand} from '../../../bin/kustomizeCommand.ts';
import {GATEWAY_KEYS_SECRET} from '../../../generator.ts';
import {generateGatewayKeys, gatewayKeysConfig} from '../../../orchestrator/controller/kustomizeGatewayKeysEnsure.ts';

/**
 * server/test/test/testGatewayKeys.ts — the suite's gateway keys.
 *
 * The realm does not *hold* the keys, it names them: the tree is deterministic and a regenerated tree
 * must stay byte-identical, so the pair cannot be written into it, and a pair generated into git is
 * either a secret in a repository or a new pair on every run (T-252). What can be asserted without a
 * cluster is therefore the two halves the wiring depends on — that the generated pair is the material
 * the gateway reads, and that the CLI asks for it by the right name — while the creation itself is
 * exercised where a cluster is.
 *
 * Registered as the `test.gateway.keys` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}, handler: {kustomizeGatewayKeysEnsure}}) => ({
    testGatewayKeys: ({name = 'gateway keys'}: {name?: string} = {}) =>
        group(name)([
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
                // a peer verifies with the key the gateway would have signed with (D-441).
                const keys = generateGatewayKeys();
                const document = JSON.parse(gatewayKeysConfig(keys)) as {
                    gateway: {sign: unknown; encrypt: unknown};
                    remote: {client: {sign: unknown; encrypt: unknown}};
                };
                assert.deepEqual(
                    document.gateway.sign,
                    keys.sign,
                    'the serving role is configured with the pair',
                );
                assert.deepEqual(
                    document.gateway.encrypt,
                    keys.encrypt,
                    'both halves of it',
                );
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

            async function theRealmCliAsksForTheKeys(assert: IAssert) {
                const args = (positionals: string[], argv: Record<string, unknown> = {}) =>
                    realmCommand({argv: argv as never, positionals});

                assert.equal(
                    args(['keys-ensure'], {namespace: 'shop'})?.method,
                    'kustomizeGatewayKeysEnsure',
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
                const nothingToWrite = (await kustomizeGatewayKeysEnsure({}, $meta)) as {
                    name: string;
                    created: boolean;
                    reason?: string;
                };
                assert.equal(
                    nothingToWrite.name,
                    GATEWAY_KEYS_SECRET,
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
