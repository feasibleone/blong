/**
 * How long a response may be cached, and why one policy cannot answer for every file.
 *
 * A build's output is two kinds of file under one directory: the shell (`index.html`) names the
 * hashed files, so it has to be revalidated on every visit — a cached shell keeps pointing at the
 * assets of the build before the last one — while a file whose name carries its content hash can be
 * cached for a year, because a new build gives it a new name. Everything else (a favicon, an icon
 * set, a font named by a stylesheet) gets the middle answer: cacheable, but short enough that a
 * replaced file is picked up without a version in its name.
 */
export interface ICachePolicy {
    /** The shell, which names the hashed files. Default `no-cache`. */
    html?: string;
    /** A file whose name carries a content hash. Default one year, `immutable`. */
    immutable?: string;
    /** Anything else. Default one hour. */
    asset?: string;
    /** What counts as a content hash, when a build names its files differently. */
    immutablePattern?: string;
}

/** The defaults, in one place so the server and the tests cannot disagree about them. */
export const DEFAULT_CACHE_POLICY = {
    html: 'no-cache',
    immutable: 'public, max-age=31536000, immutable',
    asset: 'public, max-age=3600',
    // Vite's `index-D3f9a2b1.js` and a webpack `main.8f2c1a9d.js` are one shape: a separator, at
    // least eight characters of hash, an extension. Eight is the shortest a build emits, and a
    // shorter run is a version number rather than a content hash.
    immutablePattern: '[.-][a-zA-Z0-9_-]{8,}\\.[a-z0-9]+$',
} as const;

/** The policy a caller configured, defaults filled in. */
export const defaultCachePolicy = (policy?: ICachePolicy): Required<ICachePolicy> => ({
    html: policy?.html ?? DEFAULT_CACHE_POLICY.html,
    immutable: policy?.immutable ?? DEFAULT_CACHE_POLICY.immutable,
    asset: policy?.asset ?? DEFAULT_CACHE_POLICY.asset,
    immutablePattern: policy?.immutablePattern ?? DEFAULT_CACHE_POLICY.immutablePattern,
});

/** Whether a path under the root names a file a build hashed into its name. */
const isImmutable = (relativePath: string, policy: Required<ICachePolicy>): boolean => {
    try {
        return new RegExp(policy.immutablePattern).test(relativePath);
    } catch {
        // A pattern a caller got wrong must not stop the server: the fallback is the short policy,
        // which is the safe direction to fail in (a stale file is corrected by the next deploy).
        return false;
    }
};

/** The `Cache-Control` a response for `relativePath` carries. */
export const cacheControlFor = (relativePath: string, policy?: ICachePolicy): string => {
    const resolved = defaultCachePolicy(policy);
    const name = relativePath.toLowerCase();
    if (name.endsWith('.html') || name === '' || name.endsWith('/')) return resolved.html;
    if (isImmutable(name, resolved)) return resolved.immutable;
    return resolved.asset;
};
