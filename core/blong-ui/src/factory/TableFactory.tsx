/**
 * TableFactory — generate a PrimeReact-compatible DataTable from a response schema.
 *
 * Produces column definitions from schema properties, wires sorting/filtering,
 * and maintains `$.selected` in form state for row selection.
 */

import React, {useCallback, useMemo, useState} from 'react';

import type {
    BlongSchema,
    BlongSchemaProperty,
    ColumnConfig,
    FetchParams,
    FetchResponse,
} from '../types.js';

/** Column definition for the generated table. */
export interface TableColumn {
    /** Property name (field key). */
    field: string;
    /** Column header label. */
    header: string;
    /** Whether the column is sortable. */
    sortable: boolean;
    /** Whether the column has filtering. */
    filter: boolean;
    /** Column width (CSS value). */
    width?: string;
    /** Whether the column is hidden. */
    hidden: boolean;
    /** Data type for formatting. */
    dataType: string;
    /** Formatter function name. */
    formatter?: string;
}

/** Props for the TableFactory component. */
export interface TableFactoryProps {
    /** The response array schema defining columns. */
    schema: BlongSchema;
    /** Table data rows. */
    data: Record<string, unknown>[];
    /** Total record count for pagination. */
    totalRecords?: number;
    /** Current page size. */
    pageSize?: number;
    /** Current page number (1-based). */
    pageNumber?: number;
    /** Selection mode. */
    selectionMode?: 'single' | 'multiple';
    /** Currently selected row(s). */
    selection?: Record<string, unknown> | Record<string, unknown>[];
    /** Called when selection changes. */
    onSelectionChange?: (selection: Record<string, unknown> | Record<string, unknown>[]) => void;
    /** Called when page/sort/filter changes. */
    onFetchParamsChange?: (params: FetchParams) => void;
    /** Whether data is loading. */
    isLoading?: boolean;
    /** CSS class for the table container. */
    className?: string;
}

/**
 * Derive table columns from a response schema.
 *
 * If the schema is an array type, uses the `items` schema.
 * Otherwise, uses the schema properties directly.
 */
export function deriveColumns(schema: BlongSchema): TableColumn[] {
    let properties: Record<string, BlongSchemaProperty> | undefined;

    if (schema.type === 'array' && schema.items) {
        const items = schema.items as BlongSchemaProperty;
        properties = items.properties as Record<string, BlongSchemaProperty>;
    } else {
        properties = schema.properties as Record<string, BlongSchemaProperty>;
    }

    if (!properties) return [];

    const columns: TableColumn[] = [];

    for (const [field, prop] of Object.entries(properties)) {
        const colConfig: ColumnConfig = prop['x-blong-column'] ?? {};

        columns.push({
            field,
            header: colConfig.header ?? prop.title ?? field,
            sortable: colConfig.sortable ?? true,
            filter: colConfig.filter ?? false,
            width: colConfig.width,
            hidden: colConfig.hidden ?? prop['x-blong-hidden'] ?? false,
            dataType: typeof prop.type === 'string' ? prop.type : 'string',
            formatter: colConfig.formatter,
        });
    }

    // Sort by x-blong-order
    return columns
        .filter(col => !col.hidden)
        .sort((a, b) => {
            const propA = properties![a.field] as BlongSchemaProperty;
            const propB = properties![b.field] as BlongSchemaProperty;
            return (propA['x-blong-order'] ?? 999) - (propB['x-blong-order'] ?? 999);
        });
}

/**
 * Format a cell value based on its data type.
 */
function formatCellValue(value: unknown, dataType: string): string {
    if (value == null) return '';
    if (dataType === 'boolean') return value ? 'Yes' : 'No';
    if (dataType === 'number' || dataType === 'integer') return String(value);
    if (value instanceof Date) return value.toLocaleDateString();
    return String(value);
}

/**
 * TableFactory component — generates a data table from a response schema.
 *
 * @example
 * ```tsx
 * <TableFactory
 *     schema={methodSchema.response}
 *     data={fetchResult.items}
 *     totalRecords={fetchResult.pagination.recordsTotal}
 *     selectionMode="single"
 *     onSelectionChange={setSelected}
 *     onFetchParamsChange={setFetchParams}
 * />
 * ```
 */
export function TableFactory({
    schema,
    data,
    totalRecords = 0,
    pageSize = 20,
    pageNumber = 1,
    selectionMode,
    selection,
    onSelectionChange,
    onFetchParamsChange,
    isLoading = false,
    className = '',
}: TableFactoryProps): React.ReactElement {
    const columns = useMemo(() => deriveColumns(schema), [schema]);
    const [sortField, setSortField] = useState<string | undefined>();
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleSort = useCallback(
        (field: string) => {
            const newOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
            setSortField(field);
            setSortOrder(newOrder);
            onFetchParamsChange?.({
                orderBy: [{field, dir: newOrder}],
                paging: {pageSize, pageNumber},
            });
        },
        [sortField, sortOrder, pageSize, pageNumber, onFetchParamsChange],
    );

    const handlePageChange = useCallback(
        (newPage: number) => {
            onFetchParamsChange?.({
                orderBy: sortField ? [{field: sortField, dir: sortOrder}] : undefined,
                paging: {pageSize, pageNumber: newPage},
            });
        },
        [sortField, sortOrder, pageSize, onFetchParamsChange],
    );

    const handleRowClick = useCallback(
        (row: Record<string, unknown>) => {
            if (!selectionMode || !onSelectionChange) return;
            if (selectionMode === 'single') {
                onSelectionChange(row);
            } else {
                const currentSelection = Array.isArray(selection) ? selection : [];
                const exists = currentSelection.some(
                    s => JSON.stringify(s) === JSON.stringify(row),
                );
                onSelectionChange(
                    exists
                        ? currentSelection.filter(s => JSON.stringify(s) !== JSON.stringify(row))
                        : [...currentSelection, row],
                );
            }
        },
        [selectionMode, selection, onSelectionChange],
    );

    if (isLoading) {
        return React.createElement('div', {className: `blong-table blong-table-loading ${className}`},
            React.createElement('div', {className: 'blong-skeleton blong-skeleton-table'}),
        );
    }

    const totalPages = Math.ceil(totalRecords / pageSize);

    // Render header
    const headerRow = React.createElement(
        'tr',
        null,
        ...columns.map(col =>
            React.createElement(
                'th',
                {
                    key: col.field,
                    style: col.width ? {width: col.width} : undefined,
                    onClick: col.sortable ? () => handleSort(col.field) : undefined,
                    className: col.sortable ? 'blong-th-sortable' : '',
                },
                col.header,
                sortField === col.field && (sortOrder === 'asc' ? ' ▲' : ' ▼'),
            ),
        ),
    );

    // Render body
    const bodyRows = data.map((row, rowIdx) => {
        const isSelected = selectionMode
            ? (Array.isArray(selection)
                  ? selection.some(s => JSON.stringify(s) === JSON.stringify(row))
                  : JSON.stringify(selection) === JSON.stringify(row))
            : false;

        return React.createElement(
            'tr',
            {
                key: rowIdx,
                onClick: () => handleRowClick(row),
                className: `blong-tr ${isSelected ? 'blong-tr-selected' : ''} ${selectionMode ? 'blong-tr-selectable' : ''}`,
            },
            ...columns.map(col =>
                React.createElement(
                    'td',
                    {key: col.field},
                    formatCellValue(row[col.field], col.dataType),
                ),
            ),
        );
    });

    // Pagination
    const pagination =
        totalPages > 1
            ? React.createElement(
                  'div',
                  {className: 'blong-pagination'},
                  React.createElement(
                      'button',
                      {
                          disabled: pageNumber <= 1,
                          onClick: () => handlePageChange(pageNumber - 1),
                      },
                      '← Prev',
                  ),
                  React.createElement(
                      'span',
                      {className: 'blong-pagination-info'},
                      `Page ${pageNumber} of ${totalPages}`,
                  ),
                  React.createElement(
                      'button',
                      {
                          disabled: pageNumber >= totalPages,
                          onClick: () => handlePageChange(pageNumber + 1),
                      },
                      'Next →',
                  ),
              )
            : null;

    return React.createElement(
        'div',
        {className: `blong-table ${className}`},
        React.createElement(
            'table',
            null,
            React.createElement('thead', null, headerRow),
            React.createElement('tbody', null, ...bodyRows),
        ),
        pagination,
    );
}
