/**
 * The MLE handshake a caller made at login, kept in process memory for as long as this process lives
 * (@@F-500).
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
