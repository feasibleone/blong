/**
 * The shape of a stored blob, and the little logic that both ends of a reference share.
 *
 * A realm that stores a file keeps the reference — `blob://<namespace>/<key>` — in the column it
 * already has, and the browser turns it into the served path. Both sides therefore need to agree on
 * the URI and on what a scope list means, so this lives in the framework package rather than in the
 * realm that stores the bytes (@@D-842).
 */

/** The scope every caller carries, including one with no cookie and no session. */
export const BLOB_SCOPE_ANONYMOUS = 'anonymous';

/** The scope a caller gets for proving who it is, without naming any narrower grant. */
export const BLOB_SCOPE_AUTHENTICATED = 'authenticated';

/** A derived copy of a blob — a thumbnail, a normalised or a cropped image. */
export interface IBlobVariant {
    /** The key the variant's own content is stored under. */
    key: string;
    width?: number;
    height?: number;
}

/**
 * What the content was encrypted with.
 *
 * The algorithm and the initial vector are recorded per blob because a non-default algorithm and a
 * random IV are the two things a reader cannot guess from configuration alone (@@D-839).
 */
export interface IBlobCrypto {
    algorithm: string;
    /** The initial vector, hex encoded. */
    iv: string;
}

/** Everything a read needs, stored beside the bytes so the read path opens no database (@@D-837). */
export interface IBlobMeta {
    /** The key the content is stored under, unique within its namespace. */
    key: string;
    /** The namespace the blob belongs to — the segment a served path carries. */
    namespace: string;
    contentType: string;
    /** The plaintext size in bytes; the ciphertext is longer. */
    size: number;
    /** SHA-256 of the plaintext, hex encoded. CBC does not authenticate, so this is the check. */
    digest: string;
    /** ISO 8601. */
    createdAt: string;
    /** The actor that prepared it, when there was one. */
    createdBy?: string;
    /** What a caller must present to read it. */
    scopes: string[];
    /** Whether one of `scopes` is enough, or every one of them is required. */
    scopeMode: 'any' | 'all';
    /** `pending` until the bytes have arrived and been checked; `stored` afterwards. */
    state: 'pending' | 'stored';
    /** True when the record is expected to be discarded rather than kept. */
    temporary: boolean;
    /** When cleanup may remove it; absent for a permanent blob. */
    expiresAt?: string | null;
    originalFilename?: string;
    /** The `Cache-Control` a served answer carries, when the caller named one. */
    cacheControl?: string;
    crypto?: IBlobCrypto | null;
    variants?: Record<string, IBlobVariant>;
}

/** A stored blob, named the way a record or a URL names it. */
export interface IBlobReference {
    namespace: string;
    key: string;
}

/** The scheme a stored reference carries, so an external URL stays distinguishable. */
export const BLOB_URI_SCHEME = 'blob://';

const NAMESPACE = /^[a-z][a-z0-9-]*$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/**
 * `blob://<namespace>/<key>` — how a database column points at a stored blob.
 *
 * A caller that wants no prefix and no parsing can keep the plain `/a/<namespace>/<key>` path; this
 * function is for the value a record stores, which has to survive a round trip through a form.
 */
export function blobUriFormat({namespace, key}: IBlobReference): string {
    return `${BLOB_URI_SCHEME}${namespace}/${key}`;
}

/**
 * Read a stored reference, or answer `null` when the value is not one.
 *
 * A missing scheme, a missing or empty segment, a second slash, or a character a generated key cannot
 * hold all answer `null`: a caller uses the answer to decide between "this is a blob" and "this is a
 * URL somebody pasted", so a half-parse would be worse than a refusal.
 */
export function blobUriParse(value: unknown): IBlobReference | null {
    if (typeof value !== 'string' || !value.startsWith(BLOB_URI_SCHEME)) return null;
    const rest = value.slice(BLOB_URI_SCHEME.length);
    if (rest.includes('?') || rest.includes('#')) return null;
    const segments = rest.split('/');
    if (segments.length !== 2) return null;
    const [namespace, key] = segments as [string, string];
    if (!NAMESPACE.test(namespace) || !KEY.test(key)) return null;
    return {namespace, key};
}

/**
 * Whether a caller holding `scopes` may read a blob carrying `meta.scopes`.
 *
 * An `anonymous` blob is readable by everyone, including a caller with no cookie at all — which is
 * what makes a logo or a public thumbnail reachable from a login page. Otherwise `any` asks for one
 * of the blob's scopes and `all` for every one of them. A blob that names no scope is refused rather
 * than treated as public: forgetting to name a scope must not open a file.
 */
export function blobScopeMatch(
    meta: Pick<IBlobMeta, 'scopes' | 'scopeMode'>,
    scopes: readonly string[],
): boolean {
    const required = meta.scopes ?? [];
    if (required.includes(BLOB_SCOPE_ANONYMOUS)) return true;
    if (required.length === 0) return false;
    const held = new Set(scopes);
    return meta.scopeMode === 'all'
        ? required.every(scope => held.has(scope))
        : required.some(scope => held.has(scope));
}
