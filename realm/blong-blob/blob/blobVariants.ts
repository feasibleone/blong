/**
 * The derived images a stored photograph may carry, and the settings that decide which.
 *
 * A variant is a blob of its own — its own key, its own encryption, its own record — so nothing about
 * it depends on the parent still being reachable, and removing the parent names the keys to remove
 * (@@D-844). What is derived, and from what, is a decision of the realm rather than of the backend:
 * the store knows bytes and knows nothing about pictures.
 */
export type BlobVariantName = 'thumb' | 'normal' | 'crop';

/** One resize the commit path should perform. */
export interface IBlobVariantRequest {
    name: BlobVariantName;
    width: number;
    /** Absent keeps the aspect ratio the source has. */
    height?: number;
    /** `cover` fills the box and crops what overflows; `inside` fits the longer edge. */
    fit: 'cover' | 'inside';
}

export interface IVariantsSettings {
    /** Off by default: a deployment that serves no images should not pay for the library. */
    enabled: boolean;
    /** The largest original worth deriving from; a bigger one is stored and served as it is. */
    maxBytes: number;
    /** What a list, a table cell or an avatar shows. */
    thumb: {width: number; height: number};
    /** What a page shows instead of the full photograph. */
    normal: {width: number};
    /** What a card background is cropped to. */
    crop: {width: number; height: number};
}

export const BLOB_VARIANT_DEFAULTS: IVariantsSettings = {
    enabled: false,
    maxBytes: 32 * 1024 * 1024,
    thumb: {width: 160, height: 160},
    normal: {width: 1920},
    crop: {width: 1200, height: 630},
};

/** The content types this realm can derive from — the two `sharp` reads without a plugin. */
export function blobVariantSource(contentType: string | undefined): boolean {
    return contentType === 'image/jpeg' || contentType === 'image/png';
}

/**
 * Which variants a commit should produce.
 *
 * `thumb` is what every consumer needs, so it is not something a caller asks for. `normal` and `crop`
 * are decisions about one use of one picture, so they are named — and a name this realm does not
 * derive is ignored rather than refused, because a caller that asks for the wrong thing still wants
 * the thumbnail it does get.
 */
export function blobVariantRequests(
    settings: IVariantsSettings,
    requested?: readonly string[],
): IBlobVariantRequest[] {
    if (!settings.enabled) return [];
    const wanted = new Set(requested ?? []);
    const requests: IBlobVariantRequest[] = [
        {
            name: 'thumb',
            width: settings.thumb.width,
            height: settings.thumb.height,
            fit: 'cover',
        },
    ];
    if (wanted.has('normal')) {
        requests.push({name: 'normal', width: settings.normal.width, fit: 'inside'});
    }
    if (wanted.has('crop')) {
        requests.push({
            name: 'crop',
            width: settings.crop.width,
            height: settings.crop.height,
            fit: 'cover',
        });
    }
    return requests;
}

/** The key a variant's own content is stored under: the parent's key, named by the variant. */
export function blobVariantKey(key: string, name: BlobVariantName): string {
    return `${key}-${name}`;
}
