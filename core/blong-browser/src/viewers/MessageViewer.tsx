import React from 'react';
import type {ICommanderViewerProps} from './registry.js';
import {useViewerContent, viewerLabelStyle, viewerRowStyle, viewerValueStyle} from './util.js';

const MESSAGE_FIELDS = ['topic', 'partition', 'offset', 'key', 'timestamp'];

/**
 * MessageViewer — Kafka message leaf viewer.
 * Renders the message envelope fields (topic/partition/offset/key/timestamp)
 * plus the value (pretty-printed when it parses as JSON).
 */
export function MessageViewer({node, fetch, data, className}: ICommanderViewerProps) {
    const content = useViewerContent(node, fetch, data);
    const message = (content && typeof content === 'object' ? content : {}) as Record<string, unknown>;

    let prettyValue = String(message.value ?? '');
    try {
        prettyValue = JSON.stringify(JSON.parse(prettyValue), null, 2);
    } catch {
        // keep raw text
    }

    return (
        <div
            className={`blong-viewer blong-viewer-message ${className ?? ''}`}
            style={{padding: '0.75rem'}}
        >
            {MESSAGE_FIELDS.filter(field => message[field] !== undefined && message[field] !== null).map(
                field => (
                    <div key={field} style={viewerRowStyle}>
                        <span style={viewerLabelStyle}>{field}</span>
                        <span style={viewerValueStyle}>{String(message[field])}</span>
                    </div>
                ),
            )}
            {message.value !== undefined && message.value !== null && (
                <div style={{marginTop: '0.5rem'}}>
                    <div style={viewerLabelStyle}>value</div>
                    <pre
                        style={{
                            margin: '0.25rem 0 0',
                            padding: '0.5rem',
                            background: 'var(--surface-overlay)',
                            borderRadius: 'var(--border-radius)',
                            fontSize: '0.8rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                        }}
                    >
                        {prettyValue}
                    </pre>
                </div>
            )}
        </div>
    );
}
