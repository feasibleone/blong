import React, {useEffect, useState} from 'react';
import type {ICommanderViewerProps} from './registry.js';

function stringify(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

/**
 * JsonViewer — pretty JSON/text leaf viewer.
 * Covers manifests (YAML shown as-is), secrets, documents and messages whose
 * payload is serializable, plus any raw text content.
 */
export function JsonViewer({node, fetch, data, className}: ICommanderViewerProps) {
    const [fetched, setFetched] = useState<unknown>(undefined);

    useEffect(() => {
        if (!fetch || data !== undefined) return;
        let cancelled = false;
        void fetch().then(result => {
            if (!cancelled) setFetched(result);
        });
        return () => {
            cancelled = true;
        };
    }, [data, fetch]);

    const content = data !== undefined ? data : (fetched ?? node);

    return (
        <pre
            className={`blong-viewer blong-viewer-json ${className ?? ''}`}
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
            {stringify(content)}
        </pre>
    );
}
