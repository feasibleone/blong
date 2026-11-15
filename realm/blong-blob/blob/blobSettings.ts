import {BLOB_DEFAULTS, type IBlobConfig} from './blobConfig.ts';
import {BLOB_VARIANT_DEFAULTS, type IVariantsSettings} from './blobVariants.ts';

/**
 * What a handler needs to know, with the defaults filled in.
 *
 * Two places carry these settings and both are legitimate: a group's own slice (`blob.blob`,
 * `blob.upload`, `blob.scope`), which the group closure is handed, and the block of the port the
 * method answered on (`this.config`, `blob.blobDispatch`), where a deployment writes one key and one
 * secret for the whole realm. The port wins, because it is the more specific statement, and this is
 * the one place that shapes either into something a handler can read — so every handler agrees on a
 * default and a test needs no configuration at all (@@D-836 @@D-846).
 */
export interface IBlobSettings {
    crypto: {key?: string; algorithm: string};
    upload: {maxBytes: number; base64MaxBytes: number; tempTtl: number};
    /** The read cookie. `secret` absent means no cookie is minted and `anonymous` is all that opens. */
    cookie: {name: string; path: string; ttl: number; secret?: string};
    /** The methods asked for a caller's scopes, in the order they are asked. */
    scope: {providers: string[]};
    /** The derived images a committed photograph may carry (@@D-844). */
    variants: IVariantsSettings;
}

/** The port a handler answered on, as the settings reader sees it. */
export interface IBlobPort {
    config?: IBlobConfig;
}
/**
 * The variables a deployment fills from its Secret (T-680).
 *
 * A released process carries no key in its tree: the two credentials arrive as environment and the
 * configuration names neither, so a variable the cluster set is the fallback here rather than a second
 * place a deployment has to write (`@@D-839`).
 */
export const BLOB_ENV_KEY = 'BLOB_CBC_KEY';
export const BLOB_ENV_COOKIE_SECRET = 'BLOB_COOKIE_SECRET';
/** The block of the port a method answered on: `this.config` inside a handler (@@F-641). */
export const blobPortConfig = (port: unknown): IBlobConfig | undefined =>
    (port as IBlobPort | undefined)?.config;

export function blobSettings(config?: IBlobConfig, port?: IBlobConfig): IBlobSettings {
    const crypto = {...config?.crypto, ...port?.crypto};
    const upload = {...config?.upload, ...port?.upload};
    const cookie = {...config?.cookie, ...port?.cookie};
    const scope = {...config?.scope, ...port?.scope};
    const variants = {...config?.variants, ...port?.variants};
    return {
        crypto: {
            key: crypto.key ?? process.env[BLOB_ENV_KEY],
            algorithm: crypto.algorithm ?? BLOB_DEFAULTS.algorithm,
        },
        upload: {
            maxBytes: upload.maxBytes ?? BLOB_DEFAULTS.maxBytes,
            base64MaxBytes: upload.base64MaxBytes ?? BLOB_DEFAULTS.base64MaxBytes,
            tempTtl: upload.tempTtl ?? BLOB_DEFAULTS.tempTtl,
        },
        cookie: {
            name: cookie.name ?? 'blob.blob',
            path: cookie.path ?? '/a/',
            ttl: cookie.ttl ?? 3600,
            secret: cookie.secret ?? process.env[BLOB_ENV_COOKIE_SECRET],
        },
        scope: {providers: scope.providers ?? []},
        variants: {
            enabled: variants.enabled ?? BLOB_VARIANT_DEFAULTS.enabled,
            maxBytes: variants.maxBytes ?? BLOB_VARIANT_DEFAULTS.maxBytes,
            thumb: {
                width: variants.thumb?.width ?? BLOB_VARIANT_DEFAULTS.thumb.width,
                height: variants.thumb?.height ?? BLOB_VARIANT_DEFAULTS.thumb.height,
            },
            normal: {width: variants.normal?.width ?? BLOB_VARIANT_DEFAULTS.normal.width},
            crop: {
                width: variants.crop?.width ?? BLOB_VARIANT_DEFAULTS.crop.width,
                height: variants.crop?.height ?? BLOB_VARIANT_DEFAULTS.crop.height,
            },
        },
    };
}
