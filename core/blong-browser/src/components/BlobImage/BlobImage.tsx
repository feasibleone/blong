import './BlobImage.css';

import React from 'react';

import {assetReference, type IAssetOptions} from '../../blob/assetReference.js';
import {useBlong} from '../../context/BlongContext.js';
import {deriveInitials} from '../../lib/initials.js';

/**
 * `BlobImage` — a stored picture, or the name it stands for.
 *
 * A record holds a `blob://` reference or a URL; a person who has not chosen a photograph holds
 * nothing. So this renders one of three things: the picture, its thumbnail when the store derived one,
 * or the initials of a name in the same box — which is what the account menu already does for an avatar
 * (@@D-842).
 *
 * The thumbnail is asked for by reading the record: a variant is a blob of its own with its own key, and
 * only the record says which keys exist (@@D-844). One call, then the bytes are the browser's business —
 * the cookie the serving route reads is already set, so the `img` needs no header of its own.
 */
export interface IBlobImageProps {
    /** The stored value: `blob://<namespace>/<key>`, a URL, or empty. */
    value?: string | null;
    /** What the initials fall back to, when there is no picture to show. */
    name?: string;
    /** The box, in pixels. A number is square; `undefined` fills the parent. */
    size?: number;
    /** A circle (an avatar) or a rounded square (a card). */
    shape?: 'circle' | 'square';
    /** How the picture fills the box. */
    fit?: 'cover' | 'contain';
    /** The alternative text; defaults to the name, then to an empty string (a decorative picture). */
    alt?: string;
    className?: string;
    /** Ask the record for its thumbnail before the original; `false` serves the blob as stored. */
    thumbnail?: boolean;
    /**
     * Which stored variant to show, when the record has one — `thumb` by default.
     *
     * A variant is a blob of its own with its own key, so this is a name the record answers with and
     * not a size the browser asks for (`@@D-844`). An unknown name falls back to the original, which
     * is what makes a page that asks for `crop` work against a photograph stored without one.
     */
    variant?: string;
    /** The method that answers a record; a deployment may point this at its own. */
    infoMethod?: string;
    /** Where the serving route is mounted. */
    basePath?: IAssetOptions['basePath'];
    /** A test id, so a page test can find the element it rendered. */
    testId?: string;
}

/** The runtime handler proxy — any method key, called with (params, $meta). */
type HandlerCall = (params: object, meta: object) => Promise<unknown>;

/** What reading a record answers, narrowed to what this component decides with. */
interface IRecordAnswer {
    variants?: Record<string, {key?: string} | undefined>;
}

const DEFAULT_INFO_METHOD = 'blob.blob.get';

/** The size of the box, as CSS says it. */
function boxSize(size: number | undefined): React.CSSProperties {
    return size === undefined ? {} : {width: size, height: size};
}

export function BlobImage({
    value,
    name,
    size,
    shape = 'circle',
    fit = 'cover',
    alt,
    className,
    thumbnail = true,
    variant = 'thumb',
    infoMethod = DEFAULT_INFO_METHOD,
    basePath,
    testId,
}: IBlobImageProps) {
    const {handler} = useBlong();
    const reference = React.useMemo(() => assetReference(value, {basePath}), [value, basePath]);
    const base = reference?.src ?? null;
    // The thumbnail is remembered against the value it was derived for, so a record that changes does not
    // keep showing the picture of the one before it — and no state is set from an effect, which would
    // render twice for every new value.
    const [derived, setDerived] = React.useState<{for: string; src: string} | null>(null);
    const [brokenFor, setBrokenFor] = React.useState<string | null>(null);
    const src = derived && derived.for === base ? derived.src : base;
    const broken = brokenFor !== null && brokenFor === src;

    // The thumbnail, when the record says there is one. A blob reference is the only case that has a
    // record to ask; a pasted URL is served as it is.
    React.useEffect(() => {
        if (!thumbnail || !reference?.namespace || !reference.key) return;
        let cancelled = false;
        const call = (handler as unknown as Record<string, HandlerCall | undefined>)[infoMethod];
        if (typeof call !== 'function') return;
        void (async () => {
            try {
                const record = (await call(
                    {namespace: reference.namespace, key: reference.key},
                    {},
                )) as IRecordAnswer | null;
                const chosen = record?.variants?.[variant]?.key;
                if (cancelled || !chosen) return;
                const thumb = assetReference(`blob://${reference.namespace}/${chosen}`, {
                    basePath,
                });
                if (thumb && base) setDerived({for: base, src: thumb.src});
            } catch {
                // The record is unreadable: the original still serves, so nothing to do.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        thumbnail,
        variant,
        base,
        reference?.namespace,
        reference?.key,
        handler,
        infoMethod,
        basePath,
    ]);

    const initials = React.useMemo(() => deriveInitials(name), [name]);
    const classes = ['blong-blob-image', `blong-blob-image--${shape}`, className]
        .filter(Boolean)
        .join(' ');

    if (!src || broken) {
        return (
            <span
                className={`${classes} blong-blob-image--empty`}
                style={boxSize(size)}
                data-testid={testId}
                aria-hidden={initials ? undefined : true}
            >
                {initials ? (
                    <span className="blong-blob-image__initials">{initials}</span>
                ) : (
                    <i
                        className="pi pi-user"
                        aria-hidden
                    />
                )}
            </span>
        );
    }

    return (
        <img
            className={classes}
            style={{...boxSize(size), objectFit: fit}}
            src={src}
            alt={alt ?? name ?? ''}
            data-testid={testId}
            onError={() => setBrokenFor(src)}
        />
    );
}
