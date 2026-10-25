/**
 * Everything a list table does against the server: the search box, the column
 * filters, the sort, the page and the query that ties them into one request.
 *
 * A form table has none of this — its rows come from the form value — so the state
 * lives in a hook and the component asks a single question: what rows should I show?
 * The filters are returned as well as set, because a form table reuses them to narrow
 * rows it already holds, and because a page must restart when one of them changes.
 */
import {useQuery} from '@tanstack/react-query';
import {useCallback, useMemo, useRef, useState} from 'react';
import type {Row} from './model.js';

export interface ITableListOptions {
    /** The handler that reads a page, e.g. `portal.bundle.find`. Empty when not a list. */
    listAction: string;
    /** Params the widget declares for its own list read. */
    listParams?: Record<string, unknown>;
    /** The result key holding the rows (default `items`). */
    resultSet: string;
    /** The params the report form submitted, when the widget runs as a report. */
    reportParams?: Record<string, unknown>;
    reportMode: boolean;
    /** The label columns the read should project. */
    labelFields: string[];
    /** Master-detail keys the server narrows by, when the table is cascaded. */
    cascadeFilter?: Record<string, unknown>;
    pageSize: number;
    handler: Record<
        string,
        (params: Record<string, unknown>, meta: Record<string, unknown>) => Promise<unknown>
    >;
}

export function useTableList({
    listAction,
    listParams,
    resultSet,
    reportParams,
    reportMode,
    labelFields,
    cascadeFilter,
    pageSize,
    handler,
}: ITableListOptions) {
    const [searchInput, setSearchInput] = useState('');
    const [committedSearch, setCommittedSearch] = useState('');
    const [columnFilterInputs, setColumnFilterInputs] = useState<Record<string, string>>({});
    const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({});
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<1 | -1>(1);
    const [first, setFirst] = useState(0);
    const [listPageSize, setListPageSize] = useState(pageSize);
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isListMode = !!listAction;

    const params = useMemo(() => {
        const filterBy = Object.fromEntries(
            Object.entries(committedFilters).filter(([, value]) => value !== ''),
        );
        return {
            ...(listParams ?? {}),
            // Report params are merged before the filters so a filter takes precedence
            ...(reportParams ?? {}),
            ...(cascadeFilter ?? {}),
            ...(labelFields.length > 0 ? {labels: labelFields} : {}),
            ...(Object.keys(filterBy).length > 0 ? {filterBy} : {}),
            ...(committedSearch ? {search: committedSearch} : {}),
            ...(sortField
                ? {orderBy: [{field: sortField, dir: sortOrder === 1 ? 'ASC' : 'DESC'}]}
                : {}),
            paging: {
                pageSize: listPageSize,
                pageNumber: Math.floor(first / listPageSize) + 1,
            },
        };
    }, [
        listParams,
        reportParams,
        cascadeFilter,
        labelFields,
        committedFilters,
        committedSearch,
        sortField,
        sortOrder,
        first,
        listPageSize,
    ]);

    type ListResult = Record<string, unknown>;
    const {data, isFetching: loading} = useQuery<ListResult>({
        queryKey: [listAction, params],
        queryFn: () => handler[listAction](params, {}) as Promise<ListResult>,
        // In report mode, wait until the user submits params
        enabled: isListMode && (!reportMode || reportParams !== undefined),
        staleTime: 0,
        placeholderData: previousData => previousData,
    });

    const rows: Row[] = useMemo(() => {
        if (!data) return [];
        if (resultSet && Array.isArray((data as Record<string, unknown>)[resultSet])) {
            return (data as Record<string, unknown>)[resultSet] as Row[];
        }
        return Array.isArray(data) ? (data as Row[]) : [];
    }, [data, resultSet]);

    const total: number = useMemo(() => {
        if (!data) return 0;
        const pagination = (data as {pagination?: {recordsTotal?: number}}).pagination;
        return typeof pagination?.recordsTotal === 'number' ? pagination.recordsTotal : rows.length;
    }, [data, rows.length]);

    const onSearchChange = useCallback((value: string) => {
        setSearchInput(value);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(
            () => {
                setCommittedSearch(value);
                setFirst(0);
            },
            value === '' ? 0 : 350,
        );
    }, []);

    const onColumnFilterChange = useCallback((field: string, value: string) => {
        setColumnFilterInputs(prev => ({...prev, [field]: value}));
        if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = setTimeout(
            () => {
                setCommittedFilters(prev => {
                    const next = {...prev, [field]: value};
                    if (value === '') delete next[field];
                    return next;
                });
                setFirst(0);
            },
            value === '' ? 0 : 350,
        );
    }, []);

    return {
        isListMode,
        rows,
        total,
        loading,
        params,
        searchInput,
        onSearchChange,
        columnFilterInputs,
        committedFilters,
        onColumnFilterChange,
        sortField,
        sortOrder,
        onSortChange: (field: string | null, order: 1 | -1) => {
            setSortField(field);
            setSortOrder(order);
            setFirst(0);
        },
        first,
        setFirst,
        /** Back to the first page — a new parent row, or a new report run. */
        resetPage: () => setFirst(0),
        pageSize: listPageSize,
        setPageSize: setListPageSize,
    };
}
