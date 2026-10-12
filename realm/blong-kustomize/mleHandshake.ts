/**
 * The MLE handshake a caller made when it logged in, kept for as long as this process lives.
 *
 * A caller encrypts its calls to the gateway's public encrypt key and signs them with a key pair it
 * generated itself (`codec/adapter/mle/ready.ts`), and the gateway can only answer such a call if it
 * knows the public half of that pair: verifying the signature and encrypting the answer both need
 * it. The framework expects to read it off the token — the `enc` and `sig` claims, which is how
 * `blong-login` writes them — and the token this realm hands out is the cluster's own. A Kubernetes
 * service-account token is signed by the API server, so no claim can be added to it, and the
 * handshake has nowhere to travel. The realm therefore keeps it: `login.token.create` records what
 * the caller sent in the header of the login call (a public route carries the caller's own keys —
 * `mle.ts` reads them into `credentials.mlek`/`mlsk`), and `identity.checkInternal` hands the pair
 * back as the session a verified token is completed with.
 *
 * The keys live in process memory, and both ends have to be the same process. The operator answers
 * the login namespace *and* its own gateway, which is what makes memory the whole store; a caller
 * whose token outlives the process has to log in again, because the alternative is a claim the
 * cluster will not sign.
 */

export interface IMleHandshake {
    /** The caller's public encrypt JWK — what an answer is encrypted to. */
    mlek: object;
    /** The caller's public sign JWK — what a signed call is verified with. */
    mlsk: object;
}

/**
 * How many handshakes are kept: one per calling identity, oldest dropped first. The map holds live
 * browser sessions, not state anything depends on across a restart, so a bound is enough — and a
 * bound is needed, because an identity arrives with every login and nothing else ever removes one.
 */
const LIMIT = 64;

const handshakes = new Map<string, IMleHandshake>();

export const rememberMleHandshake = (identity: string, handshake: IMleHandshake): void => {
    const key = identity.trim();
    if (!key) return;
    // Re-inserting moves the entry to the end, so the eviction below drops the least recently
    // *logged in* identity rather than the least recently used one.
    handshakes.delete(key);
    handshakes.set(key, handshake);
    while (handshakes.size > LIMIT) {
        const oldest = handshakes.keys().next();
        if (oldest.done) break;
        handshakes.delete(oldest.value);
    }
};

export const recallMleHandshake = (identity: string): IMleHandshake | undefined =>
    handshakes.get(identity.trim());
