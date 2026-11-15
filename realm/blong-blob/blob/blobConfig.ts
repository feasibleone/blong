import type {IVariantsSettings} from './blobVariants.ts';

/**
 * The realm's own configuration, under `blob`.
 *
 * The store's directory and namespaces belong to the adapter (`blob.storage`); what a *decision*
 * needs — the key, the ceilings, the lifetime of a temporary upload, the scope providers — belongs
 * here, because these are the realm's rules rather than the backend's.
 */
export interface IBlobConfig {
    crypto?: {key?: string; algorithm?: string};
    upload?: {
        /** The largest streamed payload; the route's `bodyLimit` reads it. */
        maxBytes?: number;
        /** The largest payload that may travel base64 inside a JSON call. */
        base64MaxBytes?: number;
        /** How long a temporary or uncommitted record lives, in seconds. */
        tempTtl?: number;
    };
    /**
     * The read cookie.
     *
     * The secret signs it; a process without one can issue no cookie and the serving route then only
     * answers `anonymous` blobs. The path is `/a/` so the cookie never reaches the rest of the app.
     */
    cookie?: {name?: string; path?: string; ttl?: number; secret?: string};
    scope?: {providers?: string[]};
    /** The derived images a committed photograph may carry (@@D-844). */
    variants?: Partial<IVariantsSettings> & {
        thumb?: {width?: number; height?: number};
        normal?: {width?: number};
        crop?: {width?: number; height?: number};
    };
}

/** The defaults, so a suite that sets nothing still has a working realm. */
export const BLOB_DEFAULTS = {
    maxBytes: 256 * 1024 * 1024,
    base64MaxBytes: 1024 * 1024,
    tempTtl: 86400,
    algorithm: 'aes-256-cbc',
} as const;
