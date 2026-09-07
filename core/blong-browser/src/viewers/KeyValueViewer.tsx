import React, {useEffect, useState} from 'react';
import type {ICommanderViewerProps} from './registry.js';

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

/**
 * KeyValueViewer — generic read-only key/value table.
 * Base for secret fields, message headers and other flat leaf payloads.
 */
export function KeyValueViewer({node, fetch, data, className}: ICommanderViewerProps) {
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
    const rows = isObject(content) ? content : {};

    return (
        <div
            className={`blong-viewer blong-viewer-keyvalue ${className ?? ''}`}
            style={{padding: '0.75rem'}}
        >
            {Object.entries(rows).map(([key, value]) => (
                <div
                    key={key}
                    style={{
                        display: 'flex',
                        gap: '0.5rem',
                        padding: '0.25rem 0',
                        borderBottom: '1px solid var(--surface-border)',
                    }}
                >
                    <span
                        style={{
                            fontWeight: 600,
                            minWidth: '10rem',
                            color: 'var(--text-color-secondary)',
                        }}
                    >
                        {key}
                    </span>
                    <span style={{wordBreak: 'break-all'}}>{formatValue(value)}</span>
                </div>
            ))}
        </div>
    );
}
