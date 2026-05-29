import {ActionButton} from '../components/ActionButton/ActionButton.js';
import {
    Calendar,
    Checkbox,
    Column,
    DataTable,
    Dropdown,
    InputMask,
    InputNumber,
    InputText,
    InputTextarea,
    MultiSelect,
    Password,
    SelectButton,
    Toolbar,
    type DataTableSelectionChangeParams,
} from '../primereact/index.js';

import type {IEnrichedFieldSchema, IWidgetProps, IWidgetToolbarButton} from '@feasibleone/blong';
import {useQuery} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button} from '../components/Button/Button.js';
import {useBlongFormState} from '../components/Form/FormContext.js';
import {Text} from '../components/Text/Text.js';
import {useBlong} from '../context/BlongContext.js';
import {dateIn, dateOut} from './DateWidget.js';

type Row = Record<string, unknown>;
type DropdownOption = {value: unknown; label: string; [k: string]: unknown};

const KEY = '__key';

function resolveWidgetType(schema: IEnrichedFieldSchema): string {
    if (schema.widget?.type) return schema.widget.type;
    if (schema.action) return 'action';
    if (schema.type === 'boolean') return 'boolean';
    if (schema.type === 'number') return 'number';
    if (schema.type === 'integer') return 'integer';
    if (schema.format === 'date-time') return 'dateTime';
    if (schema.format === 'date') return 'date';
    return 'input';
}

function getColumnOptions(
    schema: IEnrichedFieldSchema,
    dropdowns?: Record<string, unknown[]>,
): DropdownOption[] {
    const raw =
        schema.widget?.options ?? (schema.widget?.dropdown && dropdowns?.[schema.widget.dropdown]);
    if (!Array.isArray(raw)) return [];
    return raw as DropdownOption[];
}

function resolveColumns(
    widget: IWidgetProps['schema']['widget'],
    items: IWidgetProps['schema']['items'],
): {
    field: string;
    header: string;
    filter?: boolean;
    sortable?: boolean;
    fieldSchema: IEnrichedFieldSchema;
}[] {
    const properties = items?.properties as Record<string, IEnrichedFieldSchema> | undefined;
    const cols = widget?.columns;

    if (cols && Array.isArray(cols)) {
        return cols.map(c => ({
            field: c,
            header: properties?.[c]?.title ?? c,
            filter: !!(properties?.[c] as Record<string, unknown>)?.filter,
            sortable: !!(properties?.[c] as Record<string, unknown>)?.sort,
            fieldSchema: properties?.[c] ?? {},
        }));
    }
    if (cols && typeof cols === 'object') {
        return Object.entries(cols).map(([field, cfg]) => ({
            field,
            header: ((cfg as Record<string, unknown>)?.title as string) ?? field,
            fieldSchema: properties?.[field] ?? {},
        }));
    }
    const hidden = new Set(widget?.hidden ?? []);
    const show = cols ? (Array.isArray(cols) ? cols : Object.keys(cols)) : null;
    if (properties) {
        return Object.entries(properties)
            .filter(([field]) => !hidden.has(field) && (!show || show.includes(field)))
            .map(([field, schema]) => ({
                field,
                header: schema.title ?? field,
                filter: !!(schema as Record<string, unknown>).filter,
                sortable: !!(schema as Record<string, unknown>).sort,
                fieldSchema: schema,
            }));
    }
    return [];
}

function newRow(colFields: string[], properties?: Record<string, IEnrichedFieldSchema>): Row {
    const row: Row = {};
    for (const field of colFields) {
        const schema = properties?.[field];
        if (schema && 'default' in (schema as Record<string, unknown>)) {
            row[field] = (schema as Record<string, unknown>).default;
        } else if (schema?.type === 'boolean' || schema?.widget?.type === 'boolean') {
            row[field] = false;
        } else if (
            schema?.type === 'number' ||
            schema?.type === 'integer' ||
            ['number', 'integer', 'currency', 'percent'].includes(schema?.widget?.type ?? '')
        ) {
            row[field] = null;
        } else {
            row[field] = '';
        }
    }
    row[KEY] = Math.random().toString();
    return row;
}

function renderBody(
    widgetType: string,
    field: string,
    rowData: Row,
    cellId: string,
    options: DropdownOption[],
    keyFieldName: string,
    fieldSchema: IEnrichedFieldSchema,
): React.ReactNode {
    const value = rowData[field];

    switch (widgetType) {
        case 'action':
            return (
                <ActionButton
                    label={String(value)}
                    className="p-button-link p-0"
                    action={fieldSchema?.action}
                    params={{
                        [keyFieldName]: rowData[keyFieldName],
                        id: rowData[keyFieldName],
                        current: rowData,
                    }}
                />
            );

        case 'password':
            return <span data-testid={cellId}>{value ? '*'.repeat(10) : ''}</span>;
        case 'dropdown': {
            const item = options.find(o => o.value === value);
            return (
                <span data-testid={cellId}>
                    {item?.label ?? (value != null ? String(value) : '')}
                </span>
            );
        }
        case 'dropdownTree': {
            function findLabel(nodes: DropdownOption[], v: unknown): string | undefined {
                for (const n of nodes) {
                    if (n.key === v || n.value === v) return n.label;
                    if (Array.isArray(n.children)) {
                        const found = findLabel(n.children as DropdownOption[], v);
                        if (found != null) return found;
                    }
                }
            }
            return (
                <span data-testid={cellId}>
                    {findLabel(options, value) ?? (value != null ? String(value) : '')}
                </span>
            );
        }
        case 'multiSelect':
        case 'multiSelectTree': {
            const arr = Array.isArray(value) ? (value as unknown[]) : [];
            const labels = arr.map(v => options.find(o => o.value === v)?.label ?? String(v));
            return <span data-testid={cellId}>{labels.join(', ')}</span>;
        }
        case 'select': {
            const item = options.find(o => o.value === value);
            return (
                <span data-testid={cellId}>
                    {item?.label ?? (value != null ? String(value) : '')}
                </span>
            );
        }
        case 'date': {
            if (value == null) return <span data-testid={cellId} />;
            try {
                const d = dateIn(value as string | Date);
                return (
                    <span data-testid={cellId}>
                        {d instanceof Date ? d.toLocaleDateString() : String(value)}
                    </span>
                );
            } catch {
                return <span data-testid={cellId}>{String(value)}</span>;
            }
        }
        case 'time': {
            if (value == null) return <span data-testid={cellId} />;
            const d = value instanceof Date ? value : new Date(value as string);
            return (
                <span data-testid={cellId}>
                    {isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString()}
                </span>
            );
        }
        case 'dateTime': {
            if (value == null) return <span data-testid={cellId} />;
            try {
                const d = dateIn(value as string | Date);
                return (
                    <span data-testid={cellId}>
                        {d instanceof Date ? d.toLocaleString() : String(value)}
                    </span>
                );
            } catch {
                return <span data-testid={cellId}>{String(value)}</span>;
            }
        }
        case 'number':
        case 'integer':
        case 'currency':
        case 'percent':
            return (
                <span
                    data-testid={cellId}
                    className="block text-right"
                >
                    {value != null ? String(value) : ''}
                </span>
            );
        default:
            return <span data-testid={cellId}>{value != null ? String(value) : ''}</span>;
    }
}

function renderEditor(
    widgetType: string,
    fieldSchema: IEnrichedFieldSchema,
    field: string,
    rowData: Row,
    cellId: string,
    cellName: string,
    editorCallback: (v: unknown) => void,
    options: DropdownOption[],
): React.ReactNode {
    const value = rowData[field];

    switch (widgetType) {
        case 'integer':
            return (
                <InputNumber
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value == null ? null : Number(value)}
                    onValueChange={e => editorCallback(e.value)}
                    className="w-full"
                    inputClassName="w-full text-right"
                    showButtons
                    min={fieldSchema.minimum}
                    max={fieldSchema.maximum}
                />
            );
        case 'number':
            return (
                <InputNumber
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value == null ? null : Number(value)}
                    onValueChange={e => editorCallback(e.value)}
                    className="w-full"
                    inputClassName="w-full text-right"
                    min={fieldSchema.minimum}
                    max={fieldSchema.maximum}
                />
            );
        case 'currency':
        case 'percent':
            return (
                <InputNumber
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value == null ? null : Number(value)}
                    onValueChange={e => editorCallback(e.value)}
                    className="w-full"
                    inputClassName="w-full text-right"
                    mode="decimal"
                    minFractionDigits={2}
                    maxFractionDigits={4}
                    min={fieldSchema.minimum}
                    max={fieldSchema.maximum}
                />
            );
        case 'dropdown':
        case 'dropdownTree':
            return (
                <Dropdown
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value}
                    options={options}
                    onChange={e => editorCallback(e.value)}
                    className="w-full blong-dropdown"
                    showClear={!fieldSchema.required}
                    placeholder="Select…"
                    filter={options.length > 8}
                />
            );
        case 'multiSelect':
        case 'multiSelectTree':
            return (
                <MultiSelect
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={Array.isArray(value) ? value : []}
                    options={options}
                    onChange={e => editorCallback(e.value)}
                    className="w-full blong-multiselect"
                    display="chip"
                    placeholder="Select…"
                />
            );
        case 'select':
            return (
                <SelectButton
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value}
                    options={options}
                    onChange={e => editorCallback(e.value)}
                    className="white-space-nowrap"
                />
            );
        case 'password':
            return (
                <Password
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onInput={e => editorCallback(e.currentTarget.value)}
                    className="w-full"
                    inputClassName="w-full"
                    feedback={false}
                />
            );
        case 'date':
            return (
                <Calendar
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    showOnFocus={false}
                    value={value != null ? dateIn(value as string | Date) : null}
                    onChange={e =>
                        editorCallback(e.value instanceof Date ? dateOut(e.value) : e.value)
                    }
                    showIcon
                    className="w-full"
                />
            );
        case 'time':
            return (
                <Calendar
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    showOnFocus={false}
                    value={value != null ? new Date(value as string) : new Date(1970, 0, 1)}
                    onChange={e => editorCallback(e.value)}
                    timeOnly
                    showIcon
                    className="w-full"
                />
            );
        case 'dateTime':
            return (
                <Calendar
                    inputId={cellId}
                    name={cellName}
                    data-testid={cellId}
                    showOnFocus={false}
                    value={value != null ? dateIn(value as string | Date) : null}
                    onChange={e =>
                        editorCallback(e.value instanceof Date ? dateOut(e.value) : e.value)
                    }
                    showTime
                    showIcon
                    className="w-full"
                />
            );
        case 'mask':
            return (
                <InputMask
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onChange={e => editorCallback(e.value)}
                    mask={fieldSchema.widget?.mask ?? ''}
                    className="w-full"
                />
            );
        case 'boolean':
        case 'checkbox':
            return (
                <span onClick={e => e.stopPropagation()}>
                    <Checkbox
                        checked={Boolean(value)}
                        onChange={e => editorCallback(e.checked)}
                    />
                </span>
            );
        case 'text':
        case 'textArea':
            return (
                <InputTextarea
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onChange={e => editorCallback(e.target.value)}
                    autoFocus
                    className="w-full"
                    rows={2}
                />
            );
        default:
            // input, chips, autocomplete, dateRange, etc.
            return (
                <InputText
                    id={cellId}
                    name={cellName}
                    data-testid={cellId}
                    value={value != null ? String(value) : ''}
                    onChange={e => editorCallback(e.target.value)}
                    autoFocus
                    className="w-full"
                />
            );
    }
}

function resolveParentField(parent?: string): string | undefined {
    if (!parent) return undefined;
    if (parent.startsWith('$.selected.')) return parent.slice('$.selected.'.length);
    return parent;
}

/**
 * Extract the stable key value from a parent selection row.
 * Uses `keyFieldName` as the primary key field.
 * `keyFieldName` defaults to 'id' in the widget config, so this value
 * is always valid when the widget is properly configured.
 */
function getParentKeyValue(
    parentRow: Record<string, unknown> | null,
    keyFieldName: string,
): unknown {
    if (!parentRow) return null;
    return parentRow[keyFieldName];
}

// ── Template resolution helpers (for widget.toolbar params) ──────────────────

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

function resolveToolbarParams(
    params: Record<string, unknown> | string | undefined,
    context: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (params === undefined || params === null) return undefined;
    if (typeof params === 'string') {
        const singleExpr = params.trim().match(/^\$\{([^}]+)\}$/);
        if (singleExpr) {
            const val = getPath(context, singleExpr[1].trim());
            if (val !== null && typeof val === 'object') return val as Record<string, unknown>;
            return {value: val};
        }
        const resolved = params.replace(/\$\{([^}]+)\}/g, (_, expr) => {
            const v = getPath(context, (expr as string).trim());
            return v === undefined || v === null
                ? ''
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v);
        });
        return {value: resolved};
    }
    return Object.fromEntries(
        Object.entries(params).map(([k, v]) => {
            if (typeof v === 'string') {
                const r = resolveToolbarParams(v, context);
                return [k, r?.value !== undefined ? r.value : r];
            }
            return [k, v];
        }),
    );
}

function evalToolbarEnabled(
    enabled: IWidgetToolbarButton['enabled'],
    selection: Row[],
    currentRow: Row | null,
): boolean {
    if (enabled === 'current') return currentRow !== null;
    if (enabled === 'selected') return selection.length > 0 || currentRow !== null;
    return enabled !== false;
}

export function TableWidget({
    id,
    name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
    onSelect,
    dropdowns,
}: IWidgetProps) {
    const cols = resolveColumns(schema.widget, schema.items ?? schema);
    const colFields = cols.map(c => c.field);
    const tableId = id ?? name;
    const properties = schema.items?.properties as Record<string, IEnrichedFieldSchema> | undefined;

    // ── listAction mode: external data loading ────────────────────────────
    const listAction = schema.widget?.listAction ?? '';
    const listParams = schema.widget?.listParams;
    const resultSet = schema.widget?.resultSet ?? 'items';
    const keyFieldName = schema.widget?.keyField ?? 'id';
    const initialPageSize = schema.widget?.pageSize ?? 25;
    const widgetToolbar = schema.widget?.toolbar ?? [];
    const widgetToolbarRight = schema.widget?.toolbarRight ?? [];
    const isListMode = !!listAction;

    // listAction-mode state
    const [searchInput, setSearchInput] = useState('');
    const [committedSearch, setCommittedSearch] = useState('');
    const [columnFilterInputs, setColumnFilterInputs] = useState<Record<string, string>>({});
    const [committedFilters, setCommittedFilters] = useState<Record<string, string>>({});
    const [listSortField, setListSortField] = useState<string | null>(null);
    const [listSortOrder, setListSortOrder] = useState<1 | -1>(1);
    const [listFirst, setListFirst] = useState(0);
    const [listPageSize, setListPageSize] = useState(initialPageSize);
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {handler} = useBlong();

    // Subscribe to table selections from FormStateContext (slow-changing — only updates on
    // row selection events, never on keystrokes).  Falls back gracefully to undefined when
    // TableWidget is used outside a Form (e.g. in standalone stories / tests).
    const formState = useBlongFormState();

    // ── Report params (from report "Run" button) ──────────────────────────
    const reportMode = formState?.reportMode ?? false;
    const reportParams = formState?.reportParams;

    // ── Cascaded table filtering ───────────────────────────────────────────
    const parentFieldName = resolveParentField(schema.widget?.parent);
    const masterMapping = schema.widget?.master;
    const parentSelection = parentFieldName
        ? (formState?.tableSelections[parentFieldName] as
              | {row: Record<string, unknown>; index: number}
              | null
              | undefined)
        : undefined;

    // In listAction mode, reset paging and include master filter in server params
    // when parent selection changes. In non-listAction mode, client-side filtering applies.
    const prevParentKeyForPagingRef = useRef<unknown>(undefined);

    // Reset paging when the cascaded parent selection changes (listAction mode).
    // Compare using the row's keyField value for stable identity (not object reference).
    useEffect(() => {
        if (!isListMode || !parentFieldName) return;
        const curKey = getParentKeyValue(parentSelection?.row ?? null, keyFieldName);
        if (prevParentKeyForPagingRef.current === curKey) return;
        prevParentKeyForPagingRef.current = curKey;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setListFirst(0);
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setSingleSelected(null);
    }, [isListMode, parentFieldName, parentSelection?.row, keyFieldName]);

    // Reset paging when report params change (new "Run Report" submission).
    const prevReportParamsRef = useRef<Record<string, unknown> | undefined>(undefined);
    useEffect(() => {
        if (!isListMode || !reportMode) return;
        if (prevReportParamsRef.current === reportParams) return;
        prevReportParamsRef.current = reportParams;
        if (reportParams !== undefined) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setListFirst(0);
        }
    }, [isListMode, reportMode, reportParams]);

    const mergedListParams = useMemo(() => {
        const filterBy = Object.fromEntries(
            Object.entries(committedFilters).filter(([, v]) => v !== ''),
        );
        // In listAction mode with parent cascade, send master filter keys as server-side params
        const cascadeFilter: Record<string, unknown> = {};
        if (isListMode && parentFieldName && masterMapping && parentSelection) {
            for (const [ownKey, parentKey] of Object.entries(masterMapping)) {
                cascadeFilter[ownKey] = parentSelection.row[parentKey];
            }
        }
        return {
            ...(listParams ?? {}),
            // Report params are merged before cascade/column filters so column filters take precedence
            ...(reportParams ?? {}),
            ...cascadeFilter,
            ...(Object.keys(filterBy).length > 0 ? {filterBy} : {}),
            ...(committedSearch ? {search: committedSearch} : {}),
            ...(listSortField
                ? {orderBy: [{field: listSortField, dir: listSortOrder === 1 ? 'ASC' : 'DESC'}]}
                : {}),
            paging: {pageSize: listPageSize, pageNumber: Math.floor(listFirst / listPageSize) + 1},
        };
    }, [
        listParams,
        reportParams,
        isListMode,
        parentFieldName,
        masterMapping,
        parentSelection,
        committedFilters,
        committedSearch,
        listSortField,
        listSortOrder,
        listFirst,
        listPageSize,
    ]);

    type ListResult = Record<string, unknown>;
    const {data: listQueryData, isFetching: listLoading} = useQuery<ListResult>({
        queryKey: [listAction, mergedListParams],
        queryFn: () => handler[listAction](mergedListParams, {}) as Promise<ListResult>,
        // In report mode, wait until the user submits params (reportParams becomes defined)
        enabled: isListMode && (!reportMode || reportParams !== undefined),
        staleTime: 0,
        placeholderData: previousData => previousData,
    });

    const listRows: Row[] = useMemo(() => {
        if (!listQueryData) return [];
        if (resultSet && Array.isArray((listQueryData as Record<string, unknown>)[resultSet])) {
            return (listQueryData as Record<string, unknown>)[resultSet] as Row[];
        }
        if (Array.isArray(listQueryData)) return listQueryData as Row[];
        return [];
    }, [listQueryData, resultSet]);

    const listTotal: number = useMemo(() => {
        if (!listQueryData) return 0;
        const pagination = (listQueryData as {pagination?: {recordsTotal?: number}}).pagination;
        return typeof pagination?.recordsTotal === 'number'
            ? pagination.recordsTotal
            : listRows.length;
    }, [listQueryData, listRows.length]);

    const handleSearchChange = useCallback((v: string) => {
        setSearchInput(v);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(
            () => {
                setCommittedSearch(v);
                setListFirst(0);
            },
            v === '' ? 0 : 350,
        );
    }, []);

    const handleColumnFilterChange = useCallback((field: string, v: string) => {
        setColumnFilterInputs(prev => ({...prev, [field]: v}));
        if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = setTimeout(
            () => {
                setCommittedFilters(prev => {
                    const next = {...prev, [field]: v};
                    if (v === '') delete next[field];
                    return next;
                });
                setListFirst(0);
            },
            v === '' ? 0 : 350,
        );
    }, []);

    // ── Rows source (form-value vs listAction) ────────────────────────────
    const rows: Row[] = isListMode
        ? listRows
        : (Array.isArray(value) ? (value as Row[]) : []).map((r, i) => ({
              ...r,
              [KEY]: (r as Row)[KEY] ?? i,
          }));

    // ── Pivot transformation ───────────────────────────────────────────────
    // When widget.pivot is configured, overlay existing data onto a fixed set
    // of rows derived from `examples` (static) or a named `dropdown` (dynamic).
    // The `join` map describes how pivot row fields map to actual data row fields.
    const pivotCfg = schema.widget?.pivot as
        | {examples?: Row[]; dropdown?: string; join?: Record<string, string>}
        | undefined;
    const pivotBaseRows: Row[] | undefined = pivotCfg
        ? (pivotCfg.examples ??
          (pivotCfg.dropdown
              ? ((dropdowns?.[pivotCfg.dropdown] as Row[] | undefined) ?? undefined)
              : undefined))
        : undefined;
    const pivotJoinDataFields = new Set<string>(Object.values(pivotCfg?.join ?? {}));

    const baseRows: Row[] = pivotBaseRows
        ? (() => {
              const joinEntries = Object.entries(pivotCfg!.join ?? {});
              return pivotBaseRows.map((pivotRow, i) => {
                  const found = rows.find(r =>
                      joinEntries.every(([pivotKey, rowKey]) => pivotRow[pivotKey] === r[rowKey]),
                  );
                  if (found) return {...found, [KEY]: `pivot-${i}`};
                  // Build an empty row seeded with the join field values
                  const seeded: Row = {[KEY]: `pivot-${i}`};
                  for (const [pivotKey, rowKey] of joinEntries) {
                      seeded[rowKey] = pivotRow[pivotKey];
                  }
                  return seeded;
              });
          })()
        : rows;

    // Client-side cascaded filtering (non-listAction mode only).
    // In listAction mode, the cascade filter is sent to the server via mergedListParams.
    const filteredRows = useMemo(
        () =>
            !isListMode && parentFieldName && masterMapping
                ? parentSelection
                    ? baseRows.filter(r =>
                          Object.entries(masterMapping).every(
                              ([ownKey, parentKey]) => r[ownKey] === parentSelection.row[parentKey],
                          ),
                      )
                    : []
                : baseRows,
        [isListMode, parentFieldName, masterMapping, parentSelection, baseRows],
    );

    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
    const [pendingEdit, setPendingEdit] = useState<Record<string, boolean> | null>(null);
    const [selected, setSelected] = useState<Row[]>([]);
    const [singleSelected, setSingleSelected] = useState<Row | null>(null);
    const allowEdit = schema.widget?.actions?.allowEdit !== false;
    const allowAdd = schema.widget?.actions?.allowAdd !== false && !pivotBaseRows;
    const allowDelete = schema.widget?.actions?.allowDelete !== false && !pivotBaseRows;
    const editable = !readOnly && allowEdit;
    const interactionDisabled = disabled || readOnly;
    const isSingleSelect = schema.widget?.selectionMode === 'single';
    const widgetLabel = schema.widget?.label;

    const fireSingleSelect = useCallback(
        (row: Row | null) => {
            if (!row) {
                onSelect?.(name, null);
                return;
            }
            if (isListMode) {
                // In listAction mode rows have no KEY field; use keyFieldName
                const originalIndex = rows.findIndex(r => r[keyFieldName] === row[keyFieldName]);
                onSelect?.(name, {row: row as Record<string, unknown>, index: originalIndex});
                return;
            }
            const {[KEY]: _k, ...clean} = row;
            const originalIndex = rows.findIndex(r => r[KEY] === row[KEY]);
            onSelect?.(name, {row: clean as Record<string, unknown>, index: originalIndex});
        },
        [rows, name, onSelect, isListMode, keyFieldName],
    );

    const rowClass = useCallback(
        (data: Row) => {
            if (!isSingleSelect || !singleSelected) return '';
            const matchKey = isListMode ? keyFieldName : KEY;
            return data[matchKey] === singleSelected[matchKey] ? 'blong-table-current' : '';
        },
        [isSingleSelect, singleSelected, isListMode, keyFieldName],
    );

    const prevParentKeyForAutoSelectRef = useRef<unknown>(undefined);
    useEffect(() => {
        if (!schema.widget?.autoSelect || !parentFieldName) return;
        // Use the parent row's key field value for stable identity (not object reference)
        const curKey = getParentKeyValue(parentSelection?.row ?? null, keyFieldName);
        if (prevParentKeyForAutoSelectRef.current === curKey) return;
        prevParentKeyForAutoSelectRef.current = curKey;
        if (filteredRows.length > 0) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setSingleSelected(filteredRows[0]);
            fireSingleSelect(filteredRows[0]);
        } else {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setSingleSelected(null);
            onSelect?.(name, null);
        }
    }, [
        name,
        parentSelection,
        parentFieldName,
        schema.widget?.autoSelect,
        filteredRows,
        fireSingleSelect,
        onSelect,
        keyFieldName,
    ]);

    useEffect(() => {
        if (!pendingEdit) return;
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setPendingEdit(null);
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setEditingRows(prev => ({...prev, ...pendingEdit}));
    }, [pendingEdit]);

    const onRowEditChange = useCallback(
        (e: {data: Record<string, boolean>}) => setEditingRows(e.data),
        [],
    );

    const onRowEditComplete = useCallback(
        (e: {newData: Row}) => {
            const {[KEY]: rowKey, ...rowData} = e.newData;
            if (pivotCfg) {
                const joinEntries = Object.entries(pivotCfg.join ?? {});
                const isMatch = (r: Row) =>
                    joinEntries.every(([, jk]) => r[jk] === (rowData as Row)[jk]);
                const updated = rows.some(isMatch)
                    ? rows.map(r => (isMatch(r) ? {...r, ...rowData} : r))
                    : [...rows, rowData as Row];
                onChange(updated.map(({[KEY]: _k, ...r}) => r));
                return;
            }
            const updated = rows.map(r => (r[KEY] === rowKey ? {...rowData, [KEY]: rowKey} : r));
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, onChange, pivotCfg],
    );

    const addRow = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            const row = newRow(colFields, properties);
            if (parentSelection && masterMapping) {
                for (const [ownKey, parentKey] of Object.entries(masterMapping)) {
                    row[ownKey] = parentSelection.row[String(parentKey)];
                }
            }
            const updated = [...rows, row];
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
            setPendingEdit({[rows.length]: true});
        },
        [rows, colFields, properties, onChange, parentSelection, masterMapping],
    );

    const deleteSelected = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            const selectedKeys = new Set<unknown>();
            for (const r of selected) selectedKeys.add(r[KEY]);
            if (singleSelected) selectedKeys.add(singleSelected[KEY]);
            if (selectedKeys.size === 0) return;
            const updated = rows.filter(r => !selectedKeys.has(r[KEY]));
            setSelected([]);
            setSingleSelected(null);
            onSelect?.(name, null);
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, selected, singleSelected, onChange, onSelect, name],
    );

    // ── Template context for custom toolbar params ────────────────────────
    const currentRowKey = singleSelected?.[isListMode ? keyFieldName : KEY];
    const templateContext = useMemo(
        () => ({
            [keyFieldName]: currentRowKey,
            id: currentRowKey,
            current: singleSelected,
            selected: selected.length > 0 ? selected : singleSelected ? [singleSelected] : [],
            ...(singleSelected ?? {}),
        }),
        [singleSelected, selected, keyFieldName, currentRowKey],
    );

    // ── Toolbar rendering ─────────────────────────────────────────────────
    const [busyCount, setBusyCount] = useState(0);
    const isBusy = busyCount > 0;

    const renderCustomButton = (btn: IWidgetToolbarButton, idx: number) => {
        const isEnabled = evalToolbarEnabled(btn.enabled, selected, singleSelected);
        const resolvedParams = resolveToolbarParams(btn.params, templateContext);
        return (
            <Button
                key={idx}
                label={btn.label}
                icon={btn.icon}
                className="p-button mr-2"
                type="button"
                disabled={isBusy || !isEnabled}
                onClick={e => {
                    e.preventDefault();
                    if (!btn.method) return;
                    setBusyCount(c => c + 1);
                    void (
                        handler[btn.method](resolvedParams ?? {}, {}) as Promise<unknown>
                    ).finally(() => setBusyCount(c => c - 1));
                }}
            />
        );
    };

    // listAction mode: search + paginator in toolbar right
    const listModeSearchBar = isListMode ? (
        <span
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
            }}
        >
            <i
                className="pi pi-search"
                style={{position: 'absolute', left: '0.5rem', pointerEvents: 'none'}}
            />
            <InputText
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search…"
                data-testid="browse-search"
                style={{width: '9rem', paddingLeft: '1.75rem'}}
            />
            {searchInput && (
                <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-sm"
                    style={{position: 'absolute', right: 0, padding: '0.25rem'}}
                    type="button"
                    onClick={() => handleSearchChange('')}
                />
            )}
        </span>
    ) : null;

    const hasCustomToolbar =
        widgetToolbar.length > 0 || widgetToolbarRight.length > 0 || isListMode;
    const actionButtons =
        !isListMode && editable ? (
            <>
                {allowAdd && (
                    <Button
                        label="Add"
                        icon="pi pi-plus"
                        className="p-button mr-2"
                        onClick={addRow}
                        type="button"
                        disabled={interactionDisabled}
                        data-testid={`${tableId}-addButton`}
                    />
                )}
                {allowDelete && (
                    <Button
                        label="Delete"
                        icon="pi pi-trash"
                        className="p-button"
                        onClick={deleteSelected}
                        type="button"
                        disabled={interactionDisabled || (!selected.length && !singleSelected)}
                        data-testid={`${tableId}-deleteButton`}
                    />
                )}
            </>
        ) : null;

    const toolbarLeftContent = (
        <>
            {widgetLabel && (
                <span className="p-card-title mr-2">
                    <Text>{widgetLabel}</Text>
                </span>
            )}
            {widgetToolbar.map(renderCustomButton)}
            {!widgetLabel && actionButtons}
        </>
    );

    const toolbarRightContent = (
        <>
            {widgetToolbarRight.map(renderCustomButton)}
            {widgetLabel && actionButtons}
            {listModeSearchBar}
        </>
    );

    const showToolbar = editable || widgetLabel || hasCustomToolbar;

    if (parentFieldName && masterMapping && !parentSelection) return null;

    // listAction mode: compute dataKey and active row key
    const dataKeyField = isListMode ? keyFieldName : KEY;
    const hasFilter = cols.some(c => c.filter);

    return (
        <div
            data-testid={`${tableId}`}
            className="blong-table-widget w-full"
            style={isListMode ? {display: 'flex', flexDirection: 'column'} : undefined}
        >
            {showToolbar && (
                <Toolbar
                    left={toolbarLeftContent}
                    right={toolbarRightContent}
                    className="p-0 border-none"
                    style={{background: 'none'}}
                />
            )}
            <DataTable
                value={filteredRows}
                editMode={!isListMode && editable ? 'row' : undefined}
                editingRows={!isListMode && editable ? editingRows : undefined}
                onRowEditChange={!isListMode && editable ? onRowEditChange : undefined}
                onRowEditComplete={!isListMode && editable ? onRowEditComplete : undefined}
                dataKey={dataKeyField}
                size="small"
                loading={isListMode ? listLoading : undefined}
                lazy={isListMode}
                rowClassName={rowClass}
                selection={isSingleSelect ? singleSelected : selected}
                onSelectionChange={(e: DataTableSelectionChangeParams) => {
                    if (isSingleSelect) {
                        const row = e.value as Row | null;
                        setSingleSelected(row);
                        fireSingleSelect(row);
                    } else {
                        setSelected(e.value as Row[]);
                    }
                }}
                selectionMode={isSingleSelect ? 'single' : 'multiple'}
                metaKeySelection={false}
                removableSort={isListMode}
                sortField={isListMode ? (listSortField ?? undefined) : undefined}
                sortOrder={isListMode ? listSortOrder : undefined}
                onSort={
                    isListMode
                        ? (e: {sortField: string; sortOrder: number}) => {
                              const order = (e.sortOrder ?? 0) as 0 | 1 | -1;
                              setListSortField(order === 0 ? null : (e.sortField ?? null));
                              setListSortOrder(order === 0 ? 1 : order);
                              setListFirst(0);
                          }
                        : undefined
                }
                filterDisplay={hasFilter && !isListMode ? 'row' : undefined}
            >
                {!isSingleSelect && (editable || isListMode) && !pivotBaseRows && (
                    <Column
                        selectionMode="multiple"
                        style={{width: '3rem', flexGrow: 0}}
                    />
                )}
                {cols.map(({field, header, filter, sortable, fieldSchema}) => {
                    const widgetType = resolveWidgetType(fieldSchema);
                    const options = getColumnOptions(fieldSchema, dropdowns);
                    const isNumeric = ['number', 'integer', 'currency', 'percent'].includes(
                        widgetType,
                    );
                    const isBoolType = ['boolean', 'checkbox'].includes(widgetType);

                    return (
                        <Column
                            key={field}
                            field={field}
                            header={
                                isListMode && filter ? (
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.25rem',
                                        }}
                                    >
                                        <Text>{header}</Text>
                                        <InputText
                                            value={columnFilterInputs[field] ?? ''}
                                            onChange={e =>
                                                handleColumnFilterChange(field, e.target.value)
                                            }
                                            placeholder="Filter…"
                                            className="p-inputtext-sm"
                                            style={{width: '100%', fontSize: '0.8125rem'}}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                ) : (
                                    <Text>{header}</Text>
                                )
                            }
                            filter={filter && !isListMode}
                            sortable={sortable || isListMode}
                            alignHeader={isNumeric ? 'right' : undefined}
                            bodyClassName={isNumeric ? 'text-right' : undefined}
                            body={(rowData: Row, colOptions) => {
                                const cellId = `${tableId}-${colOptions.rowIndex}-${field}`;
                                if (isBoolType) {
                                    if (rowData[field] == null)
                                        return <span data-testid={cellId} />;
                                    return (
                                        <span data-testid={cellId}>
                                            <i
                                                className={`pi ${
                                                    rowData[field]
                                                        ? 'pi-check text-green-500'
                                                        : 'pi-times text-red-500'
                                                }`}
                                            />
                                        </span>
                                    );
                                }
                                return renderBody(
                                    widgetType,
                                    field,
                                    rowData,
                                    cellId,
                                    options,
                                    keyFieldName,
                                    fieldSchema,
                                );
                            }}
                            editor={
                                !isListMode &&
                                editable &&
                                !fieldSchema.readOnly &&
                                !pivotJoinDataFields.has(field)
                                    ? colOptions => {
                                          const cellId = `${tableId}-${colOptions.rowIndex}-${field}`;
                                          const cellName = `${tableId}[${colOptions.rowIndex}].${field}`;
                                          return renderEditor(
                                              widgetType,
                                              fieldSchema,
                                              field,
                                              colOptions.rowData as Row,
                                              cellId,
                                              cellName,
                                              (v: unknown) => colOptions.editorCallback?.(v),
                                              options,
                                          );
                                      }
                                    : undefined
                            }
                        />
                    );
                })}
                {!isListMode && editable && (
                    <Column
                        rowEditor
                        style={{width: '7rem', textAlign: 'center'}}
                    />
                )}
            </DataTable>
            {isListMode && listTotal > 0 && (
                <div
                    className="blong-table-paginator"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.5rem',
                        justifyContent: 'center',
                        userSelect: 'none',
                        flexShrink: 0,
                    }}
                >
                    <Button
                        icon="pi pi-angle-double-left"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst === 0}
                        onClick={() => setListFirst(0)}
                    />
                    <Button
                        icon="pi pi-angle-left"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst === 0}
                        onClick={() => setListFirst(Math.max(0, listFirst - listPageSize))}
                    />
                    <span style={{padding: '0 0.5rem', fontSize: '0.875rem'}}>
                        {Math.floor(listFirst / listPageSize) + 1} /{' '}
                        {Math.ceil(listTotal / listPageSize)}
                    </span>
                    <Button
                        icon="pi pi-angle-right"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst + listPageSize >= listTotal}
                        onClick={() => setListFirst(listFirst + listPageSize)}
                    />
                    <Button
                        icon="pi pi-angle-double-right"
                        className="p-button-text p-button-sm"
                        type="button"
                        disabled={listFirst + listPageSize >= listTotal}
                        onClick={() =>
                            setListFirst((Math.ceil(listTotal / listPageSize) - 1) * listPageSize)
                        }
                    />
                    <select
                        value={listPageSize}
                        onChange={e => {
                            setListPageSize(Number(e.target.value));
                            setListFirst(0);
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
}
