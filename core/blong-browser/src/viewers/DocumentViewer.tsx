import React from 'react';
import type {ICommanderViewerProps} from './registry.js';
import {useViewerContent} from './util.js';

/**
 * DocumentViewer — MongoDB / JSON document leaf viewer.
 * Pretty-prints the document and shows a compact field summary.
 */
export function DocumentViewer({node, fetch, data, className}: ICommanderViewerProps) {
    const content = useViewerContent(node, fetch, data);
    const fieldCount =
        content && typeof content === 'object' && !Array.isArray(content)
            ? Object.keys(content as Record<string, unknown>).length
            : 0;

    return (
        <div className={`blong-viewer blong-viewer-document ${className ?? ''}`}>
            {fieldCount > 0 && (
                <div
                    style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-color-secondary)',
                        borderBottom: '1px solid var(--surface-border)',
                    }}
                >
                    {fieldCount} field{fieldCount === 1 ? '' : 's'}
                </div>
            )}
            <pre
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
                {JSON.stringify(content ?? {}, null, 2)}
            </pre>
        </div>
    );
}
