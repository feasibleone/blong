import React, {useEffect, useMemo, useState} from 'react';
import type {ICommanderViewerProps} from './registry.js';

/** Chunked Uint8Array → base64 (avoids call-stack overflow on large files). */
function uint8ToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function isImageType(contentType?: string): boolean {
    return !!contentType && contentType.startsWith('image/');
}

/**
 * FileImageViewer — S3/object file viewer: image preview or text content.
 * Expects the fetched node content `{body, contentType, ...}` where `body` is
 * a byte array (or base64 string) and `contentType` hints the media type.
 */
export function FileImageViewer({node, fetch, data, contentType, className}: ICommanderViewerProps) {
    const [fetched, setFetched] = useState<Record<string, unknown> | undefined>(undefined);
    const [loading, setLoading] = useState(() => !!fetch && data === undefined);

    useEffect(() => {
        if (!fetch || data !== undefined) return;
        let cancelled = false;
        void fetch()
            .then(result => {
                if (!cancelled) setFetched(result as Record<string, unknown>);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [data, fetch]);

    const content = data !== undefined ? (data as Record<string, unknown>) : fetched;
    const body = content?.body;
    const type = contentType ?? (content?.contentType as string | undefined);
    const isImage = isImageType(type) && body !== undefined;

    const imageSrc = useMemo(() => {
        if (!isImage) return undefined;
        if (typeof body === 'string') return `data:${type};base64,${body}`;
        if (body instanceof Uint8Array) return `data:${type};base64,${uint8ToBase64(body)}`;
        return undefined;
    }, [isImage, body, type]);

    if (loading) return <div className="blong-viewer" style={{padding: '0.75rem'}}>Loading…</div>;

    if (isImage && imageSrc) {
        return (
            <div
                className={`blong-viewer blong-viewer-file ${className ?? ''}`}
                style={{padding: '0.75rem', overflow: 'auto'}}
            >
                <img
                    src={imageSrc}
                    alt={String(node.name ?? 'file')}
                    style={{maxWidth: '100%', borderRadius: 'var(--border-radius)'}}
                />
            </div>
        );
    }

    let text = '';
    if (typeof body === 'string') text = body;
    else if (body instanceof Uint8Array) text = new TextDecoder().decode(body);
    else if (content) text = JSON.stringify(content, null, 2);

    return (
        <pre
            className={`blong-viewer blong-viewer-file ${className ?? ''}`}
            style={{
                margin: 0,
                padding: '0.75rem',
                overflow: 'auto',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--surface-overlay)',
                borderRadius: 'var(--border-radius)',
            }}
        >
            {text}
        </pre>
    );
}
