/**
 * TableCard — card wrapping TableFactory with search, filters, pagination.
 *
 * Wires `fetch` method with `orderBy`/`paging` params matching the Blong
 * server convention.
 */

import React, {useCallback, useState} from 'react';

import type {BlongSchema, FetchParams, FetchResponse} from '../types.js';
import {TableFactory} from '../factory/TableFactory.js';
import {useRpcFetch} from '../hooks/useApi.js';

/** Props for the TableCard component. */
export interface TableCardProps {
    /** The response schema defining table columns. */
    schema: BlongSchema;
    /** JSON-RPC method for fetching data. */
    fetchMethod: string;
    /** Default page size. */
    pageSize?: number;
    /** Selection mode. */
    selectionMode?: 'single' | 'multiple';
    /** Called when selection changes. */
    onSelectionChange?: (selection: Record<string, unknown> | Record<string, unknown>[]) => void;
    /** Called when a row is double-clicked (open/edit). */
    onRowOpen?: (row: Record<string, unknown>) => void;
    /** Title displayed in the card header. */
    title?: string;
    /** Additional search/filter criteria. */
    criteria?: Record<string, unknown>;
    /** CSS class for the container. */
    className?: string;
}

/**
 * TableCard component — table with search, pagination, and row actions.
 *
 * @example
 * ```tsx
 * <TableCard
 *     schema={methodSchema.response}
 *     fetchMethod="user.user.find"
 *     selectionMode="single"
 *     onSelectionChange={setSelected}
 *     onRowOpen={row => navigate(`/user/${row.userId}`)}
 *     title="Users"
 * />
 * ```
 */
export function TableCard({
    schema,
    fetchMethod,
    pageSize = 20,
    selectionMode,
    onSelectionChange,
    onRowOpen: _onRowOpen,
    title,
    criteria: externalCriteria,
    className = '',
}: TableCardProps): React.ReactElement {
    const [fetchParams, setFetchParams] = useState<FetchParams>({
        paging: {pageSize, pageNumber: 1},
    });
    const [searchText, setSearchText] = useState('');
    const [selection, setSelection] = useState<
        Record<string, unknown> | Record<string, unknown>[]
    >();

    // Merge external criteria with search
    const mergedCriteria = {
        ...externalCriteria,
        ...(searchText ? {search: searchText} : {}),
    };

    const {data, isLoading} = useRpcFetch<Record<string, unknown>>({
        method: fetchMethod,
        fetchParams: {...fetchParams, criteria: mergedCriteria},
    });

    const handleFetchParamsChange = useCallback((params: FetchParams) => {
        setFetchParams(params);
    }, []);

    const handleSelectionChange = useCallback(
        (sel: Record<string, unknown> | Record<string, unknown>[]) => {
            setSelection(sel);
            onSelectionChange?.(sel);
        },
        [onSelectionChange],
    );

    const handleSearch = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setFetchParams(prev => ({
                ...prev,
                paging: {...prev.paging!, pageNumber: 1},
            }));
        },
        [],
    );

    const toolbar = React.createElement(
        'div',
        {className: 'blong-toolbar'},
        title && React.createElement('h3', {className: 'blong-toolbar-title'}, title),
        React.createElement(
            'form',
            {className: 'blong-search', onSubmit: handleSearch},
            React.createElement('input', {
                type: 'search',
                placeholder: 'Search...',
                value: searchText,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchText(e.target.value),
                className: 'blong-search-input',
            }),
            React.createElement(
                'button',
                {type: 'submit', className: 'blong-btn blong-btn-search'},
                '🔍',
            ),
        ),
    );

    return React.createElement(
        'div',
        {className: `blong-table-card ${className}`},
        toolbar,
        React.createElement(TableFactory, {
            schema,
            data: data?.items ?? [],
            totalRecords: data?.pagination?.recordsTotal ?? 0,
            pageSize: fetchParams.paging?.pageSize ?? pageSize,
            pageNumber: fetchParams.paging?.pageNumber ?? 1,
            selectionMode,
            selection,
            onSelectionChange: handleSelectionChange,
            onFetchParamsChange: handleFetchParamsChange,
            isLoading,
        }),
    );
}
