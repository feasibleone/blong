/** The suite's secret configuration: one Secret, generated where missing, never rotated (@@D-855). */
import {handler, type IMeta} from '@feasibleone/blong';
import {generateKeyPairSync, randomBytes} from 'node:crypto';
import {PART_OF_LABEL, SUITE_SECRETS_LABEL} from '../../apply.ts';
import {SUITE_SECRETS_LEGACY_NAME, SUITE_SECRETS_SECRET} from '../../generator.ts';
import {OPERATOR_GROUP, OPERATOR_VERSION} from '../../operator.ts';

/** The signing and key-agreement pair every process of a suite shares. */
export interface IGatewayKeys {
    /** The signing key, as a JWK. */
    sign: Record<string, unknown>;
    /** The key-agreement key, as a JWK. */
    encrypt: Record<string, unknown>;
}

/** What the ensure call reports: the Secret's name, and what this call did to it. */
export interface ISuiteSecretsResult {
    name: string;
    /** True when the Secret did not exist and this call wrote it whole. */
    created: boolean;
    /** True when it existed and this call added the values it was missing. */
    updated?: boolean;
    /** The paths this call added, so a pass can say what it filled in. */
    added?: string[];
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

/** The blob realm's key: 32 bytes, hex, which is what `aes-256-cbc` takes (`@@D-839`). */
export const generateBlobKey = (): string => randomBytes(32).toString('hex');

/**
 * The cookie secret a blob read is signed with (`@@D-836`).
 *
 * One value for the whole suite rather than one per process: a cookie minted by the process that
 * answered a page has to verify in whichever process serves the image beside it.
 */
export const generateCookieSecret = (): string => randomBytes(32).toString('base64url');

/**
 * The document every process reads, as the rc file the pods mount.
 *
 * One document, because the same pair serves both roles of every process and the blob key is one key
 * for the suite's store (`@@D-448` `@@D-856`). The paths are the ones the handlers read (`this.config`),
 * so nothing has to be copied from the document into a realm's own block.
 */
export const suiteSecretsConfig = ({
    gateway,
    blobKey,
    cookieSecret,
    supplied = {},
}: {
    gateway: IGatewayKeys;
    blobKey: string;
    cookieSecret: string;
    supplied?: Record<string, unknown>;
}): string =>
    JSON.stringify(
        deepMerge(
            {
                gateway: {sign: gateway.sign, encrypt: gateway.encrypt},
                remote: {client: {sign: gateway.sign, encrypt: gateway.encrypt}},
                kustomize: {login: {session: {key: gateway.sign}}},
                blob: {
                    blobDispatch: {
                        crypto: {key: blobKey},
                        cookie: {secret: cookieSecret},
                    },
                },
            },
            supplied,
        ),
    );

/** A value the deployment supplied wins over one this realm would generate: it knows better. */
const deepMerge = (
    base: Record<string, unknown>,
    over: Record<string, unknown>,
): Record<string, unknown> => {
    const result: Record<string, unknown> = {...base};
    for (const [key, value] of Object.entries(over)) {
        const current = result[key];
        result[key] =
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            current &&
            typeof current === 'object'
                ? deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
                : value;
    }
    return result;
};

/**
 * Add what the document is missing, and change nothing it already says.
 *
 * A value that is already there is the whole point of the secret (sessions outlive a deployment, and
 * a blob written under one key is unreadable under the next), so the merge is the opposite of a
 * rotation: the pass fills in what an older pass could not have known — the blob key, on a deployment
 * that predates it — and leaves the rest alone (`@@D-855` `@@D-856`).
 */
export const mergeSuiteSecrets = (
    existing: string | undefined,
    generated: Record<string, unknown>,
): {config: string; added: string[]} => {
    let current: Record<string, unknown> = {};
    if (existing) {
        try {
            current = JSON.parse(existing) as Record<string, unknown>;
        } catch {
            // A document this realm cannot read is not one it should overwrite: it belongs to whoever
            // wrote it, so nothing is added and the pass reports why.
            return {config: existing, added: []};
        }
    }
    const added: string[] = [];
    const walk = (
        target: Record<string, unknown>,
        source: Record<string, unknown>,
        path: string,
    ) => {
        for (const [key, value] of Object.entries(source)) {
            const where = path ? `${path}.${key}` : key;
            const present = target[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const nested =
                    present && typeof present === 'object'
                        ? (present as Record<string, unknown>)
                        : {};
                if (!present || typeof present !== 'object') target[key] = nested;
                walk(nested, value as Record<string, unknown>, where);
                continue;
            }
            if (present === undefined) {
                target[key] = value;
                added.push(where);
            }
        }
    };
    walk(current, generated, '');
    return {config: JSON.stringify(current), added};
};

/** The declaration the secret belongs to, when the pass read one. */
export interface ISuiteSecretsOwner {
    /** The `BlongDeployment`'s name, which is the suite's. */
    name: string;
    /** Its `uid`: the name a removal follows back to the object that asked for the secret. */
    uid: string;
}

/**
 * The Secret a suite's secret configuration is written into.
 *
 * Two labels and an owner reference are the whole of how it is kept. `part-of` is what a pass selects
 * its objects by, so without it the secret is invisible to every listing and outlives the suite it
 * belongs to; the label says a listing which now *can* see it does not make it obsolete, and the
 * reference is what removes it when the declaration does. One key holds an rc document, because the
 * pods mount the Secret as a directory and `rc` reads the `config` file in it (`@@D-441`).
 *
 * The name is the suite's rather than one consumer's: what is in it is whatever a process needs and
 * nothing should read out of a tree — the gateway pair, the blob key, the cookie secret (`@@D-855`).
 */
export const suiteSecretsSecret = ({
    name,
    namespace,
    suite,
    owner,
    config,
}: {
    name: string;
    namespace: string;
    /** The suite's name, which is the value of the label a pass selects by. */
    suite?: string;
    owner?: ISuiteSecretsOwner;
    config: string;
}): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
        name,
        namespace,
        labels: {
            ...(suite ? {[PART_OF_LABEL]: suite} : {}),
            [SUITE_SECRETS_LABEL]: 'true',
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
    stringData: {config},
});

/** The document a Secret carries, whether the cluster answered `stringData` or the stored `data`. */
export const secretConfigOf = (secret: unknown): string | undefined => {
    const entry = secret as {stringData?: Record<string, string>; data?: Record<string, string>};
    const direct = entry?.stringData?.['config'];
    if (direct !== undefined) return direct;
    const encoded = entry?.data?.['config'];
    return encoded === undefined ? undefined : Buffer.from(encoded, 'base64').toString('utf8');
};

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
         * Make sure the suite's secret configuration exists, and say what happened.
         *
         * Read first and written after, rather than applied blind: a value that already exists is the
         * whole point (a session outlives a deployment, a stored blob outlives a pass), so a second
         * call adds only what is missing — the blob key, on a suite whose secret predates it — and
         * reports what it filled in. `values` is for material the tree itself computed for an object
         * it owns (a generated service's credential, handed to every process as environment), never
         * for a credential the tenant typed: that one lives in the tenant's own rc file, which `rc`
         * merges over this document, and must not be copied into an object a pass may prune
         * @@D-857.
         */
        async kustomizeSecretsEnsure(
            params: {
                namespace?: string;
                suite?: string;
                owner?: ISuiteSecretsOwner;
                values?: Record<string, unknown>;
            } = {},
            $meta?: IMeta,
        ): Promise<ISuiteSecretsResult> {
            const name = SUITE_SECRETS_SECRET;
            const configured = (this as unknown as {config?: {suite?: {namespace?: string}}})
                .config;
            const namespace = params.namespace ?? configured?.suite?.namespace;
            if (!namespace) {
                return {name, created: false, reason: 'no namespace to create the secret in'};
            }
            const read = find('clusterSecretFind');
            const create = find('clusterSecretAdd');
            const apply = find('clusterSecretApply');
            if (!read || !create) {
                return {name, created: false, reason: 'the cluster adapter is not loaded'};
            }
            // Listed and matched rather than read by name: a named read answers 404 by throwing, and
            // "absent" is the ordinary case here, not an error. A Secret written under the older name
            // is read as this one — the object a pass created before the rename is the deployment's
            // secret configuration either way.
            const existing = (await read({namespace}, $meta as IMeta)) as {
                items?: Array<{
                    metadata?: {name?: string; labels?: Record<string, string>};
                    stringData?: Record<string, string>;
                    data?: Record<string, string>;
                }>;
            };
            const found = existing?.items?.find(
                item =>
                    item.metadata?.name === name ||
                    item.metadata?.name === SUITE_SECRETS_LEGACY_NAME,
            );

            const generated = JSON.parse(
                suiteSecretsConfig({
                    gateway: generateGatewayKeys(),
                    blobKey: generateBlobKey(),
                    cookieSecret: generateCookieSecret(),
                    supplied: params.values,
                }),
            ) as Record<string, unknown>;

            if (!found) {
                const config = JSON.stringify(generated);
                await create(
                    {
                        namespace,
                        body: suiteSecretsSecret({
                            name,
                            namespace,
                            suite: params.suite,
                            owner: params.owner,
                            config,
                        }),
                    },
                    $meta as IMeta,
                );
                return {name, created: true};
            }

            const current = secretConfigOf(found);
            const {config, added} = mergeSuiteSecrets(current, generated);
            if (!added.length) return {name, created: false, added: []};
            if (!apply) return {name, created: false, reason: 'the cluster adapter cannot apply'};
            await apply(
                {
                    namespace,
                    body: suiteSecretsSecret({
                        name,
                        namespace,
                        suite: params.suite,
                        owner: params.owner,
                        config,
                    }),
                },
                $meta as IMeta,
            );
            return {name, created: false, updated: true, added};
        },
    };
});
