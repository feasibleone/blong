/**
 * CascadedTable — parent-child table filtering via $.selected.
 *
 * Child table filters rows based on `$.selected.xxx` from parent table.
 */

import React, {useMemo, useState, useCallback} from 'react';

import type {BlongSchema, FetchParams} from '../types.js';
import {TableFactory} from '../factory/TableFactory.js';
import {useRpcFetch} from '../hooks/useApi.js';

/** Props for the CascadedTable component. */
export interface CascadedTableProps {
    /** Schema for the child table. */
    schema: BlongSchema;
    /** JSON-RPC method for fetching child data. */
    fetchMethod: string;
    /** The parent field name to filter on. */
    parentField: string;
    /** The currently selected parent row. */
    parentSelection?: Record<string, unknown>;
    /** The field in parent selection that provides the filter value. */
    parentKey: string;
    /** Selection mode for the child table. */
    selectionMode?: 'single' | 'multiple';
    /** Called when child selection changes. */
    onSelectionChange?: (
        selection: Record<string, unknown> | Record<string, unknown>[],
    ) => void;
    /** Default page size. */
    pageSize?: number;
    /** Title for the table. */
    title?: string;
    /** CSS class name. */
    className?: string;
}

/**
 * CascadedTable — child table that filters by parent selection.
 *
 * @example
 * ```tsx
 * <CascadedTable
 *     schema={orderSchema}
 *     fetchMethod="order.order.find"
 *     parentField="customerId"
 *     parentSelection={selectedCustomer}
 *     parentKey="customerId"
 *     title="Orders"
 * />
 * ```
 */
export function CascadedTable({
    schema,
    fetchMethod,
    parentField,
    parentSelection,
    parentKey,
    selectionMode,
    onSelectionChange,
    pageSize = 20,
    title,
    className = '',
}: CascadedTableProps): React.ReactElement {
    const [fetchParams, setFetchParams] = useState<FetchParams>({
        paging: {pageSize, pageNumber: 1},
    });

    const parentValue = parentSelection?.[parentKey];
    const enabled = parentValue != null;

    const criteria = useMemo(
        () => (enabled ? {[parentField]: parentValue} : {}),
        [parentField, parentValue, enabled],
    );

    const {data, isLoading} = useRpcFetch<Record<string, unknown>>({
        method: fetchMethod,
        fetchParams: {...fetchParams, criteria},
        enabled,
    });

    const handleFetchParamsChange = useCallback((params: FetchParams) => {
        setFetchParams(params);
    }, []);

    if (!enabled) {
        return React.createElement(
            'div',
            {className: `blong-cascaded-table blong-cascaded-table-empty ${className}`},
            title && React.createElement('h4', null, title),
            React.createElement('p', {className: 'blong-empty-message'}, 'Select a parent record to view related data'),
        );
    }

    return React.createElement(
        'div',
        {className: `blong-cascaded-table ${className}`},
        title && React.createElement('h4', null, title),
        React.createElement(TableFactory, {
            schema,
            data: data?.items ?? [],
            totalRecords: data?.pagination?.recordsTotal ?? 0,
            pageSize: fetchParams.paging?.pageSize ?? pageSize,
            pageNumber: fetchParams.paging?.pageNumber ?? 1,
            selectionMode,
            onSelectionChange,
            onFetchParamsChange: handleFetchParamsChange,
            isLoading,
        }),
    );
}
