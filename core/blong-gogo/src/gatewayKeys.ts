import {resolveKeySpec, type KeySpec} from '@feasibleone/blong-mle';

/**
 * One identity per process: the pair is resolved *once*, at load, and both readers are handed the
 * material.
 *
 * Two components of one process read two different config paths. The gateway mints and verifies with
 * `gateway.sign` / `gateway.encrypt`; the remote codec — the client half, which is also what the
 * gateway verifies a bearer token *through* — builds its own MLE crypto from `remote.client` when it
 * is constructed, which is before the gateway registers its plugin. Left to themselves the two
 * resolved different things: the client read a path nothing populated, so every bearer request in a
 * released process answered jose's "Key must be one of type CryptoKey, KeyObject, or JSON Web Key",
 * and one `{generate}` descriptor resolved twice is two different pairs (T-267).
 *
 * Resolving here rather than lazily is what removes the ordering question: by the time any component
 * is constructed both paths hold material, and it is the same material — the gateway's plugin finds
 * nothing left to resolve (`mle.ts` still writes back what it resolved, which a gateway built
 * without the loader may still need).
 *
 * Three rules the loop below follows. The `env` descriptor is read once and the `generate` one is
 * made once, because two readers resolving one descriptor is the disagreement this prevents; a
 * client that was given a pair of its own keeps it, because a deployment hands the pair to both
 * readers and a client's own pair is a client's decision; and a process with no `gateway` block is
 * left alone (`cli`, `k8s`), because nothing there serves a gateway.
 */

/** The spec one half generates for itself when nothing configured it. */
export const GENERATED_KEY_SPEC = {
    sign: {generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}},
    encrypt: {generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'}},
} satisfies Record<'sign' | 'encrypt', KeySpec>;

/** What a process that had to generate its own pair is told. */
export const GENERATED_PAIR_WARNING =
    'gateway: nothing configured gateway.sign or gateway.encrypt, so this process generated its own ' +
    'pair — a restart or a second replica cannot verify the tokens it mints. Mount the pair as an rc ' +
    'file, or run with the dev intent.';

/**
 * Resolve the pair into `gateway.sign` / `gateway.encrypt` and hand the same material to the rpc
 * client at `remote.client`.
 *
 * Answers whether a half had to be generated, so the caller can say so: silence would leave two
 * replicas minting tokens the other cannot verify, and the symptom of that appears somewhere else
 * entirely, long after the cause.
 */
export const resolveGatewayPair = async (config: unknown): Promise<boolean> => {
    const root = config as {gateway?: unknown; remote?: unknown} | undefined;
    const gateway = root?.gateway;
    if (!gateway || typeof gateway !== 'object') return false;
    const spec = gateway as {sign?: KeySpec; encrypt?: KeySpec};
    const remote = ((root as {remote?: {client?: Record<string, unknown>}}).remote ??= {});
    const client = (remote.client ??= {});
    let generated = false;
    for (const name of ['sign', 'encrypt'] as const) {
        if (!spec[name]) {
            spec[name] = GENERATED_KEY_SPEC[name];
            generated = true;
        }
        const resolved = await resolveKeySpec(spec[name]);
        // A half that resolved to nothing (an `env` descriptor whose variable is unset) is left as
        // it was, and the gateway decides what that means for it.
        if (resolved === undefined) continue;
        spec[name] = resolved;
        client[name] ??= resolved;
    }
    return generated;
};
