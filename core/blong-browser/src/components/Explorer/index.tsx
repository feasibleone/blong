/**
 * Explorer — DataTable + filter panel + toolbar + optional tree navigator.
 *
 * Renders a configurable list/grid view backed by query/mutation actions.
 * Supports inline selection, sorting, filtering, pagination, toolbar actions,
 * a details side-panel, an optional left-panel (children), and a grid/card layout.
 */
import {
    Column,
    DataTable,
    DataView,
    InputText,
    Splitter,
    SplitterPanel,
    Toolbar,
    type DataTableSelectionChangeParams,
    type DataTableSortParams,
} from '../../primereact/index.js';
import './index.css';

import {useCallback, useMemo, useRef, useState, type ReactNode} from 'react';
import {useBlongUi} from '../../context/BlongUiContext.js';
import {useAction} from '../../hooks/useAction.js';
import type {IToolbarButton} from '../../types/action.js';
import type {IEnrichedSchema} from '../../types/widget.js';
import {ActionButton} from '../ActionButton/index.js';
import {Button} from '../Button/index.js';
import {Navigator} from '../Navigator/index.js';

export interface IExplorerColumn {
    field: string;
    header?: string;
    sortable?: boolean;
    filterable?: boolean;
    width?: string | number;
    /** Custom body template — action name returning a cell value */
    action?: string;
}

export interface IExplorerProps {
    /** Schema for the entity list items */
    schema?: IEnrichedSchema;
    /** Explicit column definitions; if omitted, derived from schema */
    columns?: IExplorerColumn[];
    /** Action name that loads the list */
    listAction?: string;
    /** Static params for the list action */
    listParams?: Record<string, unknown>;
    /**
     * Property name in the action response that contains the rows array.
     * Defaults to 'items'. Set to '' to use the response directly as an array.
     */
    resultSet?: string;

    /** Selection mode */
    selectionMode?: 'single' | 'multiple' | 'none';
    onSelectionChange?: (value: Record<string, unknown> | Record<string, unknown>[]) => void;

    /** Toolbar buttons (left) */
    toolbar?: IToolbarButton[];
    /** Toolbar buttons (right) */
    toolbarRight?: IToolbarButton[];

    /** Show a Navigator tree on the left */
    navigator?: {
        /** Action name for tree fetch */
        listAction: string;
        /** Field used as node key */
        keyField?: string;
        /** Field used as node label */
        labelField?: string;
        /** Field used as parent key (for building tree) */
        parentField?: string;
    };

    /**
     * Left-panel content — rendered in a side panel next to the table.
     * Typical use: a navigation component or additional filter form.
     */
    children?: ReactNode;

    /**
     * Right-panel renderer — receives the currently-selected row (or null) and
     * the total record count.  When provided a details panel is shown to the
     * right of the table.
     */
    details?: (row: RowData | null, total?: number) => ReactNode;

    /**
     * View layout.
     *  - `table` (default) — standard DataTable
     *  - `grid`            — DataView with cards
     */
    view?: 'table' | 'grid';

    /**
     * Card template for `view='grid'` — renders a single row as a card.
     * When omitted, a default key-value card based on the column definitions
     * is rendered.
     */
    cardTemplate?: (row: RowData) => ReactNode;

    /** Rows per page (default 25) */
    pageSize?: number;
    /** Row size */
    size?: 'small' | 'normal' | 'large';

    /**
     * Name of the primary key field in the row data — used for template
     * resolution (`\${id}` → `row[keyField]`) and for the DataTable `dataKey`.
     * Defaults to `'id'`.
     */
    keyField?: string;

    /** Initial fit-column-widths mode on (scrollable with sticky columns).  Defaults to false. */
    fit?: boolean;

    /**
     * Unique name for this explorer instance — used as the localStorage key for
     * persisting splitter panel sizes (`<name>.splitter`).
     */
    name?: string;

    className?: string;
}

type RowData = Record<string, unknown>;

// ── Template parameter resolution ─────────────────────────────────────────────

/**
 * Shallow path access — handles `field` and `a.b` style paths.
 */
function getPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined) return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

/**
 * Resolve toolbar-button `params` templates against the current selection
 * context.  Supports:
 *   `\${id}`             → `row[keyField]`
 *   `\${current}`        → entire current (single) row
 *   `\${selected}`       → selected rows array
 *   `\${current.field}`  → field of the current row
 *   `\${field}`          → any top-level context key
 *
 * When the template string is the ONLY content (e.g. `"\${current}"`), the
 * resolved value is returned directly; otherwise it is serialised inline.
 *
 * Objects are recursively processed — template strings in object values are
 * resolved as if they were standalone.
 */
function resolveTemplate(
    params: Record<string, unknown> | string | undefined,
    context: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (params === undefined || params === null) return undefined;

    if (typeof params === 'string') {
        // Single-expression shorthand: the whole string is one ${expr}
        const singleExpr = params.trim().match(/^\$\{([^}]+)\}$/);
        if (singleExpr) {
            const val = getPath(context, singleExpr[1].trim());
            if (val !== null && typeof val === 'object') return val as Record<string, unknown>;
            return {value: val};
        }
        // General case: multiple template expressions embedded in a string
        const resolved = params.replace(/\$\{([^}]+)\}/g, (_, expr) => {
            const v = getPath(context, expr.trim());
            return v === undefined || v === null
                ? ''
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v);
        });
        return {value: resolved};
    }

    // Object: recursively resolve string values
    return Object.fromEntries(
        Object.entries(params).map(([k, v]) => {
            if (typeof v === 'string') {
                const r = resolveTemplate(v, context);
                return [k, r?.value !== undefined ? r.value : r];
            }
            return [k, v];
        }),
    );
}

/** Evaluate whether a toolbar button's `enabled` condition passes given the current selection. */
function evalEnabled(
    enabled: IToolbarButton['enabled'],
    selection: RowData | RowData[] | null,
    currentRow: RowData | null,
): boolean {
    if (enabled === 'current') return currentRow !== null;
    if (enabled === 'selected')
        return Array.isArray(selection) ? selection.length > 0 : selection !== null;
    return enabled !== false;
}

export function Explorer({
    schema,
    columns: columnsProp,
    listAction = '',
    listParams,
    selectionMode = 'single',
    onSelectionChange,
    toolbar = [],
    toolbarRight = [],
    navigator,
    children,
    details,
    view = 'table',
    cardTemplate,
    resultSet = 'items',
    pageSize: defaultPageSize = 25,
    keyField = 'id',
    size = 'small',
    fit,
    name,
    className = '',
}: IExplorerProps) {
    const [selection, setSelection] = useState<RowData | RowData[] | null>(null);
    /** The last row the user explicitly clicked — survives multi-select changes. */
    const [currentRow, setCurrentRow] = useState<RowData | null>(null);
    /** Immediate display value of the global search input (no debounce). */
    const [searchInput, setSearchInput] = useState('');
    /** Debounced search string actually sent to the server query. */
    const [committedSearch, setCommittedSearch] = useState('');
    /** Immediate per-column filter values shown in the filter row inputs. */
    const [columnFilterInputs, setColumnFilterInputs] = useState<Record<string, string>>({});
    /** Debounced column filter values sent to the server query. */
    const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({});
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<1 | -1>(1);
    const [navigatorFilter, setNavigatorFilter] = useState<Record<string, unknown>>({});
    const [first, setFirst] = useState(0);
    const [pageSize, setPageSize] = useState(defaultPageSize);
    /** Number of in-flight action calls — disables toolbar while > 0. */
    const [busyCount, setBusyCount] = useState(0);
    /** Whether the DataTable uses scrollable+flex (fit) layout. */
    const [fitMode, setFitMode] = useState(fit ?? false);
    /** Whether design mode is active (functionality TBD). */
    const [designMode, setDesignMode] = useState(false);
    /** Whether the navigator/left panel is currently open. */
    const [navOpened, setNavOpened] = useState(true);
    /** Whether the details panel is currently open. */
    const [detailsOpened, setDetailsOpened] = useState(true);
    const dataTableRef = useRef<DataTable>(null);
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const {dispatch} = useBlongUi();

    // Build query params: filter, sort, paging — React Query auto-refetches on change
    const mergedParams = useMemo(() => {
        const filterBy = Object.fromEntries(
            Object.entries(committedFilters).filter(([, v]) => v !== ''),
        );
        return {
            ...(listParams ?? {}),
            ...navigatorFilter,
            ...(Object.keys(filterBy).length > 0 ? {filterBy} : {}),
            ...(committedSearch ? {search: committedSearch} : {}),
            ...(sortField
                ? {orderBy: [{field: sortField, dir: sortOrder === 1 ? 'ASC' : 'DESC'}]}
                : {}),
            paging: {pageSize, pageNumber: Math.floor(first / pageSize) + 1},
        };
    }, [
        listParams,
        navigatorFilter,
        committedFilters,
        committedSearch,
        sortField,
        sortOrder,
        first,
        pageSize,
    ]);

    type ListResponse = Record<string, unknown> | RowData[];
    const {data, loading, refetch} = useAction<ListResponse>(listAction, 'query', mergedParams);
    const rows: RowData[] = Array.isArray(data)
        ? (data as RowData[])
        : resultSet && Array.isArray((data as Record<string, unknown>)?.[resultSet])
          ? ((data as Record<string, unknown>)[resultSet] as RowData[])
          : [];
    const serverTotal =
        typeof (data as {pagination?: {recordsTotal?: number}} | undefined)?.pagination
            ?.recordsTotal === 'number'
            ? (data as {pagination: {recordsTotal: number}}).pagination.recordsTotal
            : undefined;
    // Derive columns from schema if not explicitly provided
    const derivedColumns = useMemo((): IExplorerColumn[] => {
        if (columnsProp) return columnsProp;
        const props = schema?.properties ?? {};
        return Object.entries(props)
            .filter(([, f]) => !f['x-filter'] && !f.readOnly)
            .slice(0, 8)
            .map(([field, f]) => ({
                field,
                header: f.title ?? field,
                sortable: f['x-sort'] !== false,
                filterable: !!f['x-filterable'],
                action: f.action ?? undefined,
            }));
    }, [columnsProp, schema]);

    // Server applies filter / sort / paging; rows is already the current page
    const pagedRows = rows;
    const total = serverTotal ?? rows.length;

    /** True when at least one column defines inline filtering (shows the filter row). */
    const hasFilter = derivedColumns.some(c => c.filterable);

    const handleSelection = useCallback(
        (e: DataTableSelectionChangeParams) => {
            const val = e.value as RowData | RowData[];
            setSelection(Array.isArray(val) ? val : val);
            onSelectionChange?.(val as RowData | RowData[]);
        },
        [onSelectionChange],
    );

    /** Click handler — sets the "current" row without clearing selection in multi mode. */
    const handleRowClick = useCallback(
        (e: {data: RowData}) => {
            setCurrentRow(prev => (prev?.[keyField] === e.data[keyField] ? null : e.data));
        },
        [keyField],
    );

    /** Template context used for resolving ${...} params in toolbar buttons. */
    const templateContext = useMemo(
        () => ({
            [keyField]: currentRow?.[keyField],
            id: currentRow?.[keyField],
            current: currentRow,
            selected: Array.isArray(selection) ? selection : selection ? [selection] : [],
            ...currentRow,
        }),
        [currentRow, selection, keyField],
    );

    /** Update a column filter input immediately; debounce the commit to trigger a re-fetch. */
    const handleColumnFilterChange = useCallback((field: string, value: string) => {
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

    /** Update global search immediately; debounce the commit. */
    const handleSearchChange = useCallback((value: string) => {
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

    /** DataTable rowClassName — applies outline to the current row. */
    const rowClassName = useCallback(
        (row: object) =>
            currentRow && (row as RowData)[keyField] === currentRow[keyField]
                ? 'blong-explorer-current-row'
                : '',
        [currentRow, keyField],
    );

    /** Signal start/end of an in-flight action call to dim toolbar. */
    const onBusyChange = useCallback((busy: boolean) => {
        setBusyCount(c => c + (busy ? 1 : -1));
    }, []);

    // Renders a default grid card using the first few columns
    const defaultCard = (row: RowData) => (
        <div className="col-6 lg:col-2 md:col-3 sm:col-4">
            <div
                className="blong-explorer-card"
                style={{
                    border: '1px solid var(--surface-border)',
                    borderRadius: 'var(--border-radius)',
                    padding: '0.75rem 1rem',
                    margin: '0.25rem',
                    cursor: 'pointer',
                    background:
                        currentRow && currentRow === row
                            ? 'var(--highlight-bg)'
                            : 'var(--surface-card)',
                }}
                onClick={() => {
                    setSelection(row);
                    onSelectionChange?.(row);
                }}
            >
                {derivedColumns.slice(0, 4).map(col => (
                    <div
                        key={col.field}
                        style={{fontSize: '0.875rem', marginBottom: '0.25rem'}}
                    >
                        <span
                            style={{
                                fontWeight: 600,
                                marginRight: '0.4rem',
                                color: 'var(--text-color-secondary)',
                            }}
                        >
                            {col.header ?? col.field}:
                        </span>
                        <span>{String(row[col.field] ?? '')}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    const isBusy = busyCount > 0;

    // ── Navigator / left panel content ────────────────────────────────────────
    const leftPanelContent = navigator ? (
        <Navigator
            fetch={
                navigator.listAction
                    ? () => dispatch(navigator.listAction, {}) as Promise<Record<string, unknown[]>>
                    : undefined
            }
            keyField={navigator.keyField ?? 'id'}
            parentField={navigator.parentField ?? 'parentId'}
            field={navigator.labelField ?? 'name'}
            onSelect={node =>
                setNavigatorFilter(node ? {parentId: node[navigator.keyField ?? 'id']} : {})
            }
        />
    ) : children ? (
        <div style={{height: '100%', overflowY: 'auto'}}>{children}</div>
    ) : null;

    const hasLeftPanel = !!leftPanelContent;
    const hasDetails = !!details;

    // ── Table + paginator block ───────────────────────────────────────────────
    const tableBlock = (
        <div
            className="blong-explorer-table"
            style={{display: 'flex', flexDirection: 'column', height: '100%'}}
        >
            {view === 'grid' ? (
                <DataView
                    value={pagedRows}
                    loading={loading}
                    itemTemplate={cardTemplate ?? defaultCard}
                    layout="grid"
                    style={{flex: 1, overflow: 'auto'}}
                    className="blong-explorer-dv"
                    emptyMessage="No records found."
                />
            ) : (
                <DataTable
                    ref={dataTableRef}
                    value={pagedRows}
                    dataKey={keyField}
                    size={size}
                    loading={loading || isBusy}
                    lazy
                    selection={selection ?? undefined}
                    onSelectionChange={handleSelection}
                    onRowClick={handleRowClick}
                    selectionMode={selectionMode === 'none' ? undefined : selectionMode}
                    removableSort
                    defaultSortOrder={1}
                    sortField={sortField ?? undefined}
                    sortOrder={sortOrder}
                    onSort={(e: DataTableSortParams) => {
                        const order = (e.sortOrder ?? 0) as 0 | 1 | -1;
                        setSortField(order === 0 ? null : (e.sortField ?? null));
                        setSortOrder(order === 0 ? 1 : order);
                        setFirst(0);
                    }}
                    filterDisplay={hasFilter ? 'row' : undefined}
                    rowClassName={rowClassName}
                    className="blong-explorer-dt"
                    style={{flex: 1, minHeight: 0}}
                    emptyMessage="No records found."
                >
                    {selectionMode !== 'none' && (
                        <Column
                            selectionMode={selectionMode === 'multiple' ? 'multiple' : 'single'}
                            style={{width: 40}}
                        />
                    )}
                    {derivedColumns.map(col => (
                        <Column
                            key={col.field}
                            field={col.field}
                            header={col.header ?? col.field}
                            sortable={col.sortable !== false}
                            filter={col.filterable}
                            showFilterMenu={false}
                            style={col.width ? {width: col.width} : undefined}
                            {...(col.filterable && {
                                filterElement: () => {
                                    const val = columnFilterInputs[col.field] ?? '';
                                    return (
                                        <span
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                position: 'relative',
                                            }}
                                        >
                                            <InputText
                                                value={val}
                                                onChange={e =>
                                                    handleColumnFilterChange(
                                                        col.field,
                                                        e.target.value,
                                                    )
                                                }
                                                className="p-column-filter"
                                                style={{
                                                    width: '100%',
                                                    paddingRight: val ? '1.5rem' : undefined,
                                                }}
                                            />
                                            {val && (
                                                <Button
                                                    icon="pi pi-times"
                                                    className="p-button-text p-button-sm"
                                                    style={{
                                                        position: 'absolute',
                                                        right: 0,
                                                        padding: 0,
                                                        minWidth: '1.5rem',
                                                    }}
                                                    onClick={() =>
                                                        handleColumnFilterChange(col.field, '')
                                                    }
                                                />
                                            )}
                                        </span>
                                    );
                                },
                            })}
                            {...(col.action && {
                                body: (row: RowData) =>
                                    row[col.field] ? (
                                        <ActionButton
                                            label={String(row[col.field])}
                                            className="p-button-link p-0"
                                            action={col.action}
                                            params={{
                                                [keyField]: row[keyField],
                                                id: row[keyField],
                                                current: row,
                                            }}
                                        />
                                    ) : null,
                            })}
                        />
                    ))}
                </DataTable>
            )}
            {total > 0 && (
                <div
                    className="blong-explorer-paginator"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.5rem',
                        justifyContent: 'center',
                        userSelect: 'none',
                    }}
                >
                    <Button
                        icon="pi pi-angle-double-left"
                        className="p-button-text p-button-sm"
                        disabled={first === 0}
                        onClick={() => setFirst(0)}
                    />
                    <Button
                        icon="pi pi-angle-left"
                        className="p-button-text p-button-sm"
                        disabled={first === 0}
                        onClick={() => setFirst(Math.max(0, first - pageSize))}
                    />
                    <span style={{padding: '0 0.5rem', fontSize: '0.875rem'}}>
                        {Math.floor(first / pageSize) + 1} / {Math.ceil(total / pageSize)}
                    </span>
                    <Button
                        icon="pi pi-angle-right"
                        className="p-button-text p-button-sm"
                        disabled={first + pageSize >= total}
                        onClick={() => setFirst(first + pageSize)}
                    />
                    <Button
                        icon="pi pi-angle-double-right"
                        className="p-button-text p-button-sm"
                        disabled={first + pageSize >= total}
                        onClick={() => setFirst((Math.ceil(total / pageSize) - 1) * pageSize)}
                    />
                    <select
                        value={pageSize}
                        onChange={e => {
                            setPageSize(Number(e.target.value));
                            setFirst(0);
                        }}
                        style={{
                            marginLeft: '0.5rem',
                            background: 'var(--surface-overlay)',
                            color: 'var(--text-color)',
                            border: '1px solid var(--surface-border)',
                            borderRadius: 'var(--border-radius)',
                            padding: '0.2rem',
                        }}
                    >
                        {[10, 25, 50, 100].map(n => (
                            <option
                                key={n}
                                value={n}
                            >
                                {n}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );

    // ── Splitter panels (conditional) ─────────────────────────────────────────
    const navPanel =
        hasLeftPanel && navOpened ? (
            <SplitterPanel
                key="nav"
                size={15}
                minSize={10}
                style={{overflowY: 'auto'}}
            >
                {leftPanelContent}
            </SplitterPanel>
        ) : null;

    const detailsPanel =
        hasDetails && detailsOpened ? (
            <SplitterPanel
                key="details"
                size={30}
                minSize={15}
                style={{overflowY: 'auto', padding: '0.75rem'}}
            >
                {details!(currentRow, total)}
            </SplitterPanel>
        ) : null;

    const tableSize = navPanel && detailsPanel ? 55 : navPanel || detailsPanel ? 75 : 100;

    const contentArea =
        navPanel || detailsPanel ? (
            <Splitter
                layout="horizontal"
                gutterSize={4}
                style={{height: '100%'}}
                {...(name && {stateKey: `${name}.splitter`, stateStorage: 'local'})}
            >
                {[
                    navPanel,
                    <SplitterPanel
                        key="table"
                        size={tableSize}
                        minSize={30}
                    >
                        {tableBlock}
                    </SplitterPanel>,
                    detailsPanel,
                ].filter(Boolean)}
            </Splitter>
        ) : (
            tableBlock
        );

    return (
        <div
            className={`blong-explorer ${className}`}
            style={{display: 'flex', flexDirection: 'column', height: '100%'}}
        >
            <style>{`.blong-explorer-current-row { outline: 0.15rem solid var(--primary-color) !important; outline-offset: -0.15rem; }`}</style>
            <Toolbar
                start={
                    <div className="blong-toolbar-left">
                        {hasLeftPanel && (
                            <Button
                                icon="pi pi-bars"
                                className="p-button-text mr-2"
                                onClick={() => setNavOpened(v => !v)}
                                tooltip="Navigator"
                                style={{opacity: navOpened ? 1 : 0.5}}
                            />
                        )}
                        {toolbar.map((btn, i) => (
                            <ActionButton
                                key={i}
                                {...btn}
                                params={resolveTemplate(btn.params, templateContext)}
                                enabled={undefined}
                                disabled={
                                    isBusy || !evalEnabled(btn.enabled, selection, currentRow)
                                }
                                onBusyChange={onBusyChange}
                                className="mr-2"
                            />
                        ))}
                    </div>
                }
                end={
                    <div className="blong-toolbar-right">
                        {toolbarRight.map((btn, i) => (
                            <ActionButton
                                key={i}
                                {...btn}
                                params={resolveTemplate(btn.params, templateContext)}
                                enabled={undefined}
                                disabled={
                                    isBusy || !evalEnabled(btn.enabled, selection, currentRow)
                                }
                                onBusyChange={onBusyChange}
                                className="mr-2"
                            />
                        ))}
                        {view !== 'grid' && (
                            <Button
                                icon="pi pi-arrows-h"
                                className="p-button-text mr-2 ml-2"
                                onClick={() => setFitMode(f => !f)}
                                tooltip="Fit width"
                                style={{opacity: fitMode ? 1 : 0.5}}
                            />
                        )}
                        <Button
                            icon="pi pi-search"
                            className="p-button-text mr-2"
                            onClick={() => refetch?.()}
                            tooltip="Refresh / Search"
                            disabled={!!loading}
                        />
                        <span
                            className="p-input-icon-left mr-2"
                            style={{
                                position: 'relative',
                                display: 'inline-flex',
                                alignItems: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <i
                                className="pi pi-search"
                                style={{
                                    position: 'absolute',
                                    left: '0.5rem',
                                    pointerEvents: 'none',
                                }}
                            />
                            <InputText
                                value={searchInput}
                                onChange={e => handleSearchChange(e.target.value)}
                                placeholder="Search…"
                                className="blong-explorer-search"
                                style={{
                                    width: '10rem',
                                    paddingLeft: '1.75rem',
                                    paddingRight: searchInput ? '1.75rem' : undefined,
                                }}
                            />
                            {searchInput && (
                                <Button
                                    icon="pi pi-times"
                                    className="p-button-text p-button-sm"
                                    style={{position: 'absolute', right: 0, padding: '0.25rem'}}
                                    onClick={() => handleSearchChange('')}
                                />
                            )}
                        </span>
                        {hasDetails && (
                            <Button
                                icon="pi pi-bars"
                                className="p-button-text mr-2"
                                onClick={() => setDetailsOpened(v => !v)}
                                tooltip="Details"
                                style={{opacity: detailsOpened ? 1 : 0.5}}
                            />
                        )}
                        <Button
                            icon="pi pi-cog"
                            className="p-button-text mr-2"
                            onClick={() => setDesignMode(d => !d)}
                            tooltip="Design"
                            style={{opacity: designMode ? 1 : 0.5}}
                        />
                    </div>
                }
                className="blong-explorer-toolbar border-none p-2 flex-nowrap"
                style={{background: 'none'}}
            />
            <div style={{flex: 1, minHeight: 0}}>{contentArea}</div>
        </div>
    );
}
