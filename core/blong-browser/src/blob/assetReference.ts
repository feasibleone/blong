import {BLOB_URI_SCHEME, blobUriParse} from '@feasibleone/blong/blob';

/**
 * A stored value, resolved to something a browser can put in a `src`.
 *
 * Three shapes reach a field that shows a picture, and they are all legitimate: a `blob://` reference
 * this realm stores and serves, a URL somebody pasted, and nothing at all — a person who has not chosen
 * a photograph yet. A relative path (`/img/logo.png`, `data:…`) is the fourth and is left exactly as it
 * is, because a caller that wrote one meant it (@@D-842).
 */
export interface IAssetReference {
    src: string;
    /** Set when the value is a stored blob, so a caller may ask for a variant of it. */
    namespace?: string;
    key?: string;
}

/** Where the serving route lives; `/a/<namespace>/<key>` is what the realm publishes. */
export const ASSET_PATH = '/a';

export interface IAssetOptions {
    /** The base the serving route is mounted at; a deployment may change it. */
    basePath?: string;
}

/**
 * Resolve a stored value to a `src`, or `null` when there is nothing to show.
 *
 * A blob reference is turned into the route that serves it, with each segment encoded: a key is
 * generated and safe, but a namespace or a key written by hand is not, and a value that breaks the URL
 * would be a picture that never loads rather than a refusal (@@D-842). A value that starts with the
 * scheme but does not parse — `blob://a/b/c`, `blob://` — is `null` rather than a half-address.
 */
export function assetReference(
    value: unknown,
    options: IAssetOptions = {},
): IAssetReference | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith(BLOB_URI_SCHEME)) {
        const parsed = blobUriParse(trimmed);
        if (!parsed) return null;
        const base = (options.basePath ?? ASSET_PATH).replace(/\/+$/, '');
        return {
            src: `${base}/${encodeURIComponent(parsed.namespace)}/${encodeURIComponent(parsed.key)}`,
            namespace: parsed.namespace,
            key: parsed.key,
        };
    }

    return {src: trimmed};
}

/** The `src` alone, which is what most callers want. */
export function assetSrc(value: unknown, options: IAssetOptions = {}): string | null {
    return assetReference(value, options)?.src ?? null;
}
