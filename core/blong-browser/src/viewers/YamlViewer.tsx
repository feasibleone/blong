import React from 'react';
import type {ICommanderViewerProps} from './registry.js';
import {useViewerContent} from './util.js';

/** Minimal object → YAML-ish serializer (display only; no YAML dependency). */
function toYaml(value: unknown, indent = 0): string {
    const pad = '  '.repeat(indent);
    if (Array.isArray(value)) {
        return value
            .map(item =>
                item !== null && typeof item === 'object'
                    ? `${pad}-\n${toYaml(item, indent + 1)}`
                    : `${pad}- ${String(item)}`,
            )
            .join('\n');
    }
    if (value !== null && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, val]) => {
                if (val === null || val === undefined) return `${pad}${key}: null`;
                if (typeof val === 'object')
                    return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
                return `${pad}${key}: ${typeof val === 'string' ? val : String(val)}`;
            })
            .join('\n');
    }
    return `${pad}${String(value)}`;
}

/**
 * YamlViewer — YAML-ish manifest leaf viewer.
 * Covers Kubernetes manifests and other declarative payloads. String content is
 * shown as-is; objects/arrays are serialised in a readable YAML-like form.
 */
export function YamlViewer({node, fetch, data, className}: ICommanderViewerProps) {
    const content = useViewerContent(node, fetch, data);
    const text = typeof content === 'string' ? content : toYaml(content);

    return (
        <pre
            className={`blong-viewer blong-viewer-yaml ${className ?? ''}`}
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
