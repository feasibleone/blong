/**
 * The suite's gateway keys: one pair per suite, generated when it is missing.
 *
 * Why the tree cannot carry them: it is deterministic — a regenerated tree must be byte-identical,
 * which the realm's tests pin — and a key generated *into* it would change on every run or, worse,
 * live in git. So the realm names a Secret and the *deployment* creates it, the same rule the two rc
 * files follow.
 *
 * Why one pair per suite rather than one per process, which is what the framework does when nothing
 * is configured: a browser's session must survive a restart and a second replica. The handshake is
 * per process, so a per-process pair would make a session belong to whichever replica answered —
 * and the bearer path hands the *descriptor* it was configured with to `jose`, which accepts only key
 * material, so a released process does not merely get unstable keys: it fails where a `dev` run works
 * (`dev` supplies material — `devSignKey`/`devEncryptKey`). That is the defect this works around, and
 * a secret manager is the durable answer (recorded as a todo).
 *
 * The Secret holds one key, `config`, whose value is an rc document — the same shape and the same
 * channel the deployment's rc files use, so no variable of the framework's own choosing appears in a
 * pod's environment (D-441). The generator mounts it as a directory under the pod's home, where
 * `rc('blong_release')` finds `$HOME/.config/blong_release/config`: `gateway.sign`/`gateway.encrypt`
 * for the process that serves the gateway and `remote.client.sign`/`remote.client.encrypt` for the
 * same process calling a peer. Both read the one pair a namespace shares, which is what keeps a
 * browser's session alive across a restart and a second replica.
 */
import {handler, type IMeta} from '@feasibleone/blong';
import {generateKeyPairSync} from 'node:crypto';
import {GATEWAY_KEYS_LABEL, PART_OF_LABEL} from '../../apply.ts';
import {GATEWAY_KEYS_SECRET} from '../../generator.ts';
import {OPERATOR_GROUP, OPERATOR_VERSION} from '../../operator.ts';

/** The keys one suite's processes share. */
export interface IGatewayKeys {
    /** The signing key, as a JWK. */
    sign: Record<string, unknown>;
    /** The key-agreement key, as a JWK. */
    encrypt: Record<string, unknown>;
}

/** What the ensure call reports: the Secret's name, and whether this call made it. */
export interface IGatewayKeysResult {
    name: string;
    created: boolean;
    reason?: string;
}

/**
 * Generate a pair, in the shapes the gateway asks for.
 *
 * The pair mirrors the framework's own committed development keys (`devKeys.ts`): an EC/P-384 JWK
 * labelled `ES384`/`sig` for signing and one labelled `ECDH-ES+A256KW`/`enc` for encryption. Node's
 * own `crypto` exports the JWK, so the realm needs no dependency of its own — and none is wanted,
 * because a key generator is not a protocol implementation.
 */
export const generateGatewayKeys = (): IGatewayKeys => {
    const pair = (alg: string, use: string): Record<string, unknown> => {
        const {privateKey} = generateKeyPairSync('ec', {namedCurve: 'P-384'});
        // The private half carries the public one, and the JWK export is what the gateway reads.
        return {...privateKey.export({format: 'jwk'}), alg, use};
    };
    return {sign: pair('ES384', 'sig'), encrypt: pair('ECDH-ES+A256KW', 'enc')};
};

/**
 * The pair as the rc document the pods read.
 *
 * One document rather than two variables because the same pair serves both roles of every process:
 * the gateway a container serves (server, `gateway.*`) and the peers it calls (client,
 * `remote.client.*`). Writing it here, next to the generator, keeps the shape the Secret's writer
 * produces and the shape the mounts expect in one place.
 *
 * The realm's own session mint reads it too (`kustomize.login.session.key`), and that is deliberate:
 * `mle.ts` writes the *public* half back over `gateway.sign`, so a realm cannot reach the private half
 * through the gateway's config — the framework's login realm is given its key as its own configuration
 * for the same reason (D-448). The pair is generated per suite and never committed, so this is the one
 * place it can be handed to a realm.
 */
export const gatewayKeysConfig = (keys: IGatewayKeys): string =>
    JSON.stringify({
        gateway: {sign: keys.sign, encrypt: keys.encrypt},
        remote: {client: {sign: keys.sign, encrypt: keys.encrypt}},
        kustomize: {login: {session: {key: keys.sign}}},
    });

/** The declaration the pair belongs to, when the pass read one. */
export interface IGatewayKeysOwner {
    /** The `BlongDeployment`'s name, which is the suite's. */
    name: string;
    /** Its `uid`: the name a removal follows back to the object that asked for the pair. */
    uid: string;
}

/**
 * The Secret a suite's key pair is written into.
 *
 * Two labels and an owner reference are the whole of how it is kept. `part-of` is what a pass selects
 * its objects by, so without it the pair is invisible to every listing and outlives the suite it
 * belongs to; the key label is what says a listing which now *can* see it does not make it obsolete;
 * and the reference is what removes it when the declaration does (T-267). One key holds an rc document,
 * because the pods mount the Secret as a directory and `rc` reads the `config` file in it (D-441).
 */
export const gatewayKeysSecret = ({
    name,
    namespace,
    suite,
    owner,
    keys,
}: {
    name: string;
    namespace: string;
    /** The suite's name, which is the value of the label a pass selects by. */
    suite?: string;
    owner?: IGatewayKeysOwner;
    keys: IGatewayKeys;
}): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
        name,
        namespace,
        labels: {
            ...(suite ? {[PART_OF_LABEL]: suite} : {}),
            [GATEWAY_KEYS_LABEL]: 'true',
        },
        ...(owner
            ? {
                  ownerReferences: [
                      {
                          apiVersion: `${OPERATOR_GROUP}/${OPERATOR_VERSION}`,
                          kind: 'BlongDeployment',
                          name: owner.name,
                          uid: owner.uid,
                      },
                  ],
              }
            : {}),
    },
    type: 'Opaque',
    stringData: {config: gatewayKeysConfig(keys)},
});

export default handler(({handler}) => {
    const find = (
        name: string,
    ): ((params: unknown, $meta: IMeta) => Promise<unknown>) | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function'
            ? (candidate as (params: unknown, $meta: IMeta) => Promise<unknown>)
            : undefined;
    };

    return {
        /**
         * Create the suite's keys if they are not there yet, and say which happened.
         *
         * Read first and created after, rather than applied: a key that already exists is the whole
         * point (sessions outlive a deployment), so a second call is a no-op that reports
         * `created: false` rather than rotating what browsers are holding.
         */
        async kustomizeGatewayKeysEnsure(
            params: {namespace?: string; suite?: string; owner?: IGatewayKeysOwner} = {},
            $meta?: IMeta,
        ): Promise<IGatewayKeysResult> {
            const name = GATEWAY_KEYS_SECRET;
            const configured = (this as unknown as {config?: {suite?: {namespace?: string}}})
                .config;
            const namespace = params.namespace ?? configured?.suite?.namespace;
            if (!namespace) {
                return {name, created: false, reason: 'no namespace to create the keys in'};
            }
            const read = find('clusterSecretFind');
            const create = find('clusterSecretAdd');
            if (!read || !create) {
                return {name, created: false, reason: 'the cluster adapter is not loaded'};
            }
            // Listed and matched rather than read by name: a named read answers 404 by throwing, and
            // "absent" is the ordinary case here, not an error.
            const existing = (await read({namespace}, $meta as IMeta)) as {
                items?: Array<{metadata?: {name?: string}}>;
            };
            if (existing?.items?.some(item => item.metadata?.name === name)) {
                return {name, created: false};
            }

            const keys = generateGatewayKeys();
            await create(
                {
                    namespace,
                    body: gatewayKeysSecret({
                        name,
                        namespace,
                        suite: params.suite,
                        owner: params.owner,
                        keys,
                    }),
                },
                $meta as IMeta,
            );
            return {name, created: true};
        },
    };
});
