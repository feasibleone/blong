import React from 'react';
import {Column, DataTable} from '../primereact/index.js';
import type {ICommanderViewerProps} from './registry.js';
import {humanize, useViewerContent} from './util.js';

/** Normalise viewer content to a row array. */
function toRows(content: unknown): Record<string, unknown>[] {
    if (Array.isArray(content)) return content as Record<string, unknown>[];
    if (content && typeof content === 'object') {
        const record = content as Record<string, unknown>;
        if (Array.isArray(record.items)) return record.items as Record<string, unknown>[];
        if (Array.isArray(record.rows)) return record.rows as Record<string, unknown>[];
        return [record];
    }
    return [];
}

/**
 * TableViewer — schema-aware grid for tabular leaf content.
 * Covers DB rows (the `table` viewer type): an array of rows is rendered as a
 * DataTable with columns derived from the first row; a single object is shown
 * as a one-row grid.
 */
export function TableViewer({node, fetch, data, className}: ICommanderViewerProps) {
    const content = useViewerContent(node, fetch, data);
    const rows = toRows(content);
    const columns = rows[0]
        ? Object.keys(rows[0])
              .slice(0, 12)
              .map(field => ({field, header: humanize(field)}))
        : [];

    return (
        <div
            className={`blong-viewer blong-viewer-table ${className ?? ''}`}
            style={{padding: '0.25rem', overflow: 'auto'}}
        >
            <DataTable value={rows} size="small" dataKey="id" emptyMessage="No rows.">
                {columns.map(col => (
                    <Column key={col.field} field={col.field} header={col.header} style={{fontSize: '0.8rem'}} />
                ))}
            </DataTable>
        </div>
    );
}
