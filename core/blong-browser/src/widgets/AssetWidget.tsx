import './AssetWidget.css';

import React from 'react';

import type {IWidgetProps} from '@feasibleone/blong';

import {assetReference} from '../blob/assetReference.js';
import {BlobImage} from '../components/BlobImage/BlobImage.js';
import {useBlong} from '../context/BlongContext.js';
import {useText} from '../hooks/useText.js';
import {Button, FileUpload, InputText} from '../primereact/index.js';
import {useAppStore} from '../state/appStore.js';
import {assetIcon, assetIsImage, assetLabel} from './assetIcon.js';

// PrimeReact 8 declares chooseOptions via defaultProps which React 19 no longer merges.
const FILE_UPLOAD_OPTIONS = {
    label: undefined,
    icon: undefined,
    iconOnly: false,
    className: undefined,
    style: undefined,
} as const;

/** The `x-widget` config a field carries to become an asset. */
export interface IAssetWidgetConfig {
    /** The namespace the consuming realm claimed; the store refuses one it does not serve. */
    namespace?: string;
    /** The scopes the blob is written with — who may read it back. */
    scopes?: string[];
    /** What the file picker offers, e.g. `image/*`. */
    accept?: string;
    /** Sibling fields this field fills from the record it stored, and which piece each receives. */
    fill?: Record<string, 'contentType' | 'size' | 'digest' | 'extension' | 'filename'>;
    /** Which stored variant the preview shows — `thumb` when omitted (`@@D-844`). */
    variant?: string;
}

type HandlerCall = (params: object, meta: object) => Promise<unknown>;

interface IPrepared {
    namespace: string;
    key: string;
    uri: string;
    uploadUrl: string;
}

/** A file's reference, and the record it was written to. */
interface ICommitted {
    uri: string;
    namespace?: string;
    key?: string;
}

/** What a filled sibling can take from the record, or from the file the reader chose. */
type FillPiece = 'contentType' | 'size' | 'digest' | 'extension' | 'filename';

/** The record, as far as filling a sibling needs it. */
interface IFillRecord {
    contentType?: string;
    size?: number;
    digest?: string;
    originalFilename?: string;
}

/**
 * One piece of what the store recorded, for a sibling field.
 *
 * The extension comes from the file's own name rather than from its media type: a document's format
 * column holds `pdf`, and `application/pdf` is not what a reader of the record wants to see.
 */
function fillPiece(
    piece: FillPiece,
    record: IFillRecord | null,
    file: File,
): string | number | undefined {
    const name = record?.originalFilename ?? file.name;
    switch (piece) {
        case 'contentType':
            return record?.contentType ?? (file.type || undefined);
        case 'size':
            return record?.size ?? file.size;
        case 'digest':
            return record?.digest;
        case 'filename':
            return name;
        case 'extension':
            return name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
        default:
            return undefined;
    }
}

/**
 * `AssetWidget` — a field that holds a stored file, not a copy of one.
 *
 * The three calls are the whole upload (@@D-840): `blob.upload.prepare` reserves a key and answers the
 * route the bytes go to, the browser `PUT`s the file to that route — where the bytes never become a
 * string and a byte limit is enforced as they arrive — and `blob.upload.commit` promotes the record and
 * answers the `blob://` reference the field then holds.
 *
 * A form somebody abandoned is why the widget discards: a key that was prepared and never kept is a blob
 * nobody references, and it would sit in the store until the sweep found it. So an unmount with no value
 * left discards what it reserved, and a failed upload discards its own key rather than leaving it behind
 * (@@D-840).
 */
export function AssetWidget({
    id,
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
    onFill,
}: IWidgetProps) {
    const {handler} = useBlong();
    const token = useAppStore(state => state.auth.token);
    const config = (schema.widget ?? {}) as IAssetWidgetConfig;
    const namespace = config.namespace ?? '';
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [url, setUrl] = React.useState('');
    /** The key this widget reserved and has not handed to the form yet. */
    const reservedRef = React.useRef<{namespace: string; key: string} | null>(null);
    /** The value the form holds now, read on unmount to decide whether anything was kept. */
    const keptRef = React.useRef<unknown>(value);
    /** What the record says the file is — a generated key carries no extension to guess from. */
    const [type, setType] = React.useState<{
        value: unknown;
        contentType?: string;
        originalFilename?: string;
    } | null>(null);
    const contentType = type && type.value === value ? type.contentType : undefined;
    /** A stored file's own name: a key is a uuid, and a reader would rather read `decision.pdf`. */
    const storedName = type && type.value === value ? type.originalFilename : undefined;

    const uploadFailedLabel = useText('Upload failed');
    const removeLabel = useText('Remove');
    const pasteLabel = useText('or paste a link');
    const chooseLabel = useText('Choose a file');

    keptRef.current = value;

    const call = React.useCallback(
        (method: string, params: object) =>
            (handler as unknown as Record<string, HandlerCall>)[method](params, {}),
        [handler],
    );

    const discard = React.useCallback(
        async (target: {namespace: string; key: string}) => {
            try {
                await call('blob.upload.discard', target);
            } catch {
                // A discard that fails is the sweep's business; the field already shows the failure that
                // made it necessary.
            }
        },
        [call],
    );

    // A widget that goes away with nothing to show — a cancelled form, a tab closed mid-edit — must not
    // leave the key it reserved behind (@@D-840).
    React.useEffect(
        () => () => {
            const target = reservedRef.current;
            reservedRef.current = null;
            if (!target || keptRef.current) return;
            void discard(target);
        },
        [discard],
    );

    const send = React.useCallback(
        async (file: File) => {
            setBusy(true);
            setFailure(null);
            let prepared: IPrepared | null = null;
            try {
                prepared = (await call('blob.upload.prepare', {
                    namespace,
                    contentType: file.type || 'application/octet-stream',
                    filename: file.name,
                    size: file.size,
                    scopes: config.scopes,
                })) as IPrepared;
                reservedRef.current = {namespace: prepared.namespace, key: prepared.key};

                // The bytes go straight to the route: no base64, no JSON body, and the ceiling is the
                // route's own.
                const response = await fetch(prepared.uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        ...(file.type ? {'content-type': file.type} : {}),
                        ...(token ? {authorization: `Bearer ${token}`} : {}),
                    },
                });
                if (!response.ok) {
                    throw new Error(`${uploadFailedLabel} (${response.status})`);
                }
                const committed = (await call('blob.upload.commit', {
                    namespace: prepared.namespace,
                    key: prepared.key,
                })) as ICommitted;
                reservedRef.current = null;
                onChange(committed.uri);
                // The record knows what the file is, and the model may have columns for exactly
                // that: a document's format and checksum are copies of what the store already
                // measured, so they are published rather than typed (@@D-852).
                if (onFill) {
                    const record = (await call('blob.blob.get', {
                        namespace: committed.namespace ?? prepared.namespace,
                        key: committed.key ?? prepared.key,
                    }).catch(() => null)) as IFillRecord | null;
                    for (const [field, piece] of Object.entries(config.fill ?? {})) {
                        const filled = fillPiece(piece, record, file);
                        if (filled !== undefined) onFill(field, filled);
                    }
                }
            } catch (problem) {
                const target = reservedRef.current;
                reservedRef.current = null;
                if (target) void discard(target);
                setFailure((problem as Error)?.message ?? uploadFailedLabel);
            } finally {
                setBusy(false);
            }
        },
        [
            call,
            config.fill,
            config.scopes,
            discard,
            namespace,
            onChange,
            onFill,
            token,
            uploadFailedLabel,
        ],
    );

    const pick = React.useCallback(
        (event: {files: File[]}) => {
            const file = event.files?.[0];
            if (file) void send(file);
        },
        [send],
    );

    // A blob's key is generated, so its type is only readable from its record: without this a stored
    // photograph would show a plain file icon (@@D-842).
    React.useEffect(() => {
        const target = assetReference(value);
        if (!target?.namespace || !target.key) return;
        let cancelled = false;
        void (async () => {
            try {
                const record = (await call('blob.blob.get', {
                    namespace: target.namespace,
                    key: target.key,
                })) as {contentType?: string; originalFilename?: string} | null;
                if (cancelled || !record) return;
                setType({
                    value,
                    contentType: record.contentType,
                    originalFilename: record.originalFilename,
                });
            } catch {
                // No record: the icon falls back to the value's own name, which is what a URL has.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [call, value]);

    const reference = assetReference(value);
    const label = storedName ?? assetLabel(String(value ?? ''));
    const icon = assetIcon(contentType ?? reference?.key ?? String(value ?? ''));
    const showPicture =
        Boolean(reference) && assetIsImage(contentType ?? reference?.key ?? String(value ?? ''));

    if (readOnly || disabled) {
        return (
            <div
                className="blong-asset"
                data-testid={id ?? name}
            >
                {showPicture ? (
                    <BlobImage
                        value={String(value)}
                        name={label}
                        size={64}
                        fit="cover"
                        variant={config.variant}
                    />
                ) : reference ? (
                    // A stored file a reader may open: the label is the link, and its `href` is the
                    // served route rather than a call, so a click downloads without JavaScript
                    // (`@@D-836`). `download` asks for the browser's own save flow, which keeps the
                    // original name the store recorded.
                    <a
                        className="blong-asset__icon blong-asset__link"
                        href={reference.src}
                        download={label}
                    >
                        <i
                            className={icon}
                            aria-hidden
                        />{' '}
                        {label}
                    </a>
                ) : (
                    <span className="blong-asset__empty">—</span>
                )}
            </div>
        );
    }

    return (
        <div
            className={`blong-asset ${error ? 'p-invalid' : ''}`}
            data-testid={id ?? name}
        >
            {reference ? (
                <div className="blong-asset__current">
                    {showPicture ? (
                        <BlobImage
                            value={String(value)}
                            size={64}
                            fit="cover"
                            variant={config.variant}
                        />
                    ) : (
                        <span className="blong-asset__icon">
                            <i
                                className={icon}
                                aria-hidden
                            />
                        </span>
                    )}
                    {/* The value is a file that already exists: its label opens it, whether the field is
                        being edited or only read, so a person can check what they are about to keep
                        (`@@D-836`). `download` asks for the browser's own save flow. */}
                    <a
                        className="blong-asset__name blong-asset__link"
                        href={reference.src}
                        download={label}
                    >
                        {label}
                    </a>
                    <Button
                        type="button"
                        icon="pi pi-times"
                        text
                        rounded
                        aria-label={removeLabel}
                        onClick={() => {
                            onChange(null);
                            onBlur();
                        }}
                    />
                </div>
            ) : null}

            <div className="blong-asset__pick">
                <FileUpload
                    mode="basic"
                    auto
                    customUpload
                    uploadHandler={event => pick(event as unknown as {files: File[]})}
                    accept={config.accept}
                    multiple={false}
                    disabled={busy}
                    chooseOptions={{
                        ...FILE_UPLOAD_OPTIONS,
                        label: chooseLabel,
                        icon: 'pi pi-upload',
                    }}
                    className="blong-asset__upload"
                />
                <span className="blong-asset__or">{pasteLabel}</span>
                <InputText
                    value={url}
                    placeholder="https://…"
                    onChange={event => setUrl(event.target.value)}
                    onBlur={() => {
                        const pasted = url.trim();
                        if (!pasted) return;
                        onChange(pasted);
                        setUrl('');
                        onBlur();
                    }}
                    className="blong-asset__url"
                />
            </div>

            {failure ? <small className="blong-asset__failure">{failure}</small> : null}
        </div>
    );
}
