/**
 * The table widget: rows, paging, selection, editing mode and the toolbar around them.
 *
 * What a cell reads and how it edits lives in `./table/cells.tsx`; the pure
 * derivations in `./table/model.ts`; the state a table owns in `./table/useTableList`,
 * `./table/useTableRows`, `./table/useTableDropdowns` and `./table/useRowDrafts`; the
 * toolbar template and the paginator have their own files. What is left here is the
 * decisions only a table can make — which mode it is in, which rows are editable, and
 * where an edit goes. `@@D-620`
 */
import {useFormatValue} from '../hooks/useFormat.js';
import {
    Column,
    DataTable,
    type DataTableSelectionChangeParams,
    Dropdown,
    InputText,
    Toolbar,
} from '../primereact/index.js';

import type {IEnrichedFieldSchema, IWidgetProps, IWidgetToolbarButton} from '@feasibleone/blong';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button} from '../components/Button/Button.js';
import {useBlongFormState} from '../components/Form/FormContext.js';
import {Text} from '../components/Text/Text.js';
import {useBlong} from '../context/BlongContext.js';
import {
    InlineCellEditor,
    RowCellEditor,
    RowDraftContext,
    renderBody,
    renderEditor,
} from './table/cells.jsx';
import {
    KEY,
    type Row,
    getColumnOptions,
    getParentKeyValue,
    isCycleCell,
    newRow,
    pickPatch,
    resolveColumns,
    resolveParentField,
    resolveWidgetType,
} from './table/model.js';
import {TablePaginator} from './table/paginator.jsx';
import {evalToolbarEnabled, resolveToolbarParams} from './table/toolbar.js';
import {useRowDrafts} from './table/useRowDrafts.js';
import {useTableDropdowns} from './table/useTableDropdowns.js';
import {type ITableListOptions, useTableList} from './table/useTableList.js';
import {useTableRows} from './table/useTableRows.js';

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
    const properties = (schema.items?.properties ?? schema.properties) as
        | Record<string, IEnrichedFieldSchema>
        | undefined;

    // ── listAction mode: external data loading ────────────────────────────
    const listAction = schema.widget?.listAction ?? '';
    const listParams = schema.widget?.listParams;
    const resultSet = schema.widget?.resultSet ?? 'items';
    const keyFieldName = schema.widget?.keyField ?? 'id';
    const initialPageSize = schema.widget?.pageSize ?? 25;
    const widgetToolbar = schema.widget?.toolbar ?? [];
    const widgetToolbarRight = schema.widget?.toolbarRight ?? [];
    const isListMode = !!listAction;

    const {handler} = useBlong();
    const format = useFormatValue();

    // The option lists a cell needs to show a label, and a pivot's slot rows: the
    // caller may pass them, otherwise they are loaded once through the portal.
    const {
        resolvedDropdowns,
        signature: dropdownSignature,
        labelFields,
        pivotOptions,
    } = useTableDropdowns({
        columns: colFields,
        properties: properties as
            | Record<string, {widget?: {dropdown?: string; body?: string}}>
            | undefined,
        dropdowns,
        pivotDropdown: (schema.widget?.pivot as {dropdown?: string} | undefined)?.dropdown,
        load:
            typeof handler.portalDropdownList === 'function'
                ? (names: string[]) =>
                      handler.portalDropdownList({names}, {}) as Promise<Record<string, unknown>>
                : undefined,
    });

    // A cascade inside a row that is still being edited: the picks the row has made are
    // kept here so the cell that depends on them can recompute its list. @@D-617
    const {rowDrafts, recordRowDraft, clearRowDrafts} = useRowDrafts(cols);

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

    /** The keys the server narrows a cascaded list by, from the selected parent row. */
    const cascadeFilter = useMemo(() => {
        if (!isListMode || !parentFieldName || !masterMapping || !parentSelection) return undefined;
        return Object.fromEntries(
            Object.entries(masterMapping).map(([ownKey, parentKey]) => [
                ownKey,
                parentSelection.row[parentKey],
            ]),
        );
    }, [isListMode, parentFieldName, masterMapping, parentSelection]);

    // A list table reads its rows from the server: search, filters, sort and page are
    // one hook, so what is left here is which rows the page shows.
    const list = useTableList({
        listAction,
        listParams,
        resultSet,
        reportParams,
        reportMode,
        labelFields,
        cascadeFilter,
        pageSize: initialPageSize,
        handler: handler as unknown as ITableListOptions['handler'],
    });

    const {setFirst: resetPage} = list;

    // A new parent row starts at the first page and forgets the selected one: both
    // described the previous parent.
    const prevParentKeyForPagingRef = useRef<unknown>(undefined);
    useEffect(() => {
        if (!isListMode || !parentFieldName) return;
        const curKey = getParentKeyValue(parentSelection?.row ?? null, keyFieldName);
        if (prevParentKeyForPagingRef.current === curKey) return;
        prevParentKeyForPagingRef.current = curKey;
        resetPage(0);
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setSingleSelected(null);
    }, [isListMode, parentFieldName, parentSelection?.row, keyFieldName, resetPage]);

    // A new report run starts at the first page too.
    const prevReportParamsRef = useRef<Record<string, unknown> | undefined>(undefined);
    useEffect(() => {
        if (!isListMode || !reportMode) return;
        if (prevReportParamsRef.current === reportParams) return;
        prevReportParamsRef.current = reportParams;
        if (reportParams !== undefined) resetPage(0);
    }, [isListMode, reportMode, reportParams, resetPage]);

    // ── Pivot and filter columns ──────────────────────────────────────────
    const pivotCfg = schema.widget?.pivot as
        | {examples?: Row[]; dropdown?: string; join?: Record<string, string>; defaults?: Row}
        | undefined;
    /** The slots a pivot overlays stored rows onto: its examples, or a named dropdown. */
    const pivotBaseRows: Row[] | undefined = pivotCfg
        ? (pivotCfg.examples ??
          (pivotCfg.dropdown
              ? ((dropdowns?.[pivotCfg.dropdown] as Row[] | undefined) ?? pivotOptions ?? undefined)
              : undefined))
        : undefined;
    /** One filter input per `filter: true` column, in both modes. */
    const filterFields = useMemo(() => cols.filter(c => c.filter).map(c => c.field), [cols]);
    /** A pick-list column filters on its key, exactly; a text column on a substring. */
    const pickFields = useMemo(
        () =>
            new Set(
                cols
                    .filter(c => c.fieldSchema.widget?.dropdown || c.fieldSchema.widget?.options)
                    .map(c => c.field),
            ),
        [cols],
    );

    // Which rows the page shows: the form value in a detail table, the server's page
    // in a list, a fixed slot set in a pivot — then the cascade, the column filters
    // and the view sort. A form table narrows and sorts what it holds; a list table
    // asks the server to.
    const {
        rows,
        sortedRows,
        visibleRows,
        sortField: formSortField,
        sortOrder: formSortOrder,
        onSortChange: onFormSortChange,
        pivotJoinDataFields,
    } = useTableRows({
        value,
        listRows: list.rows,
        isListMode,
        pivotCfg,
        pivotBaseRows,
        parentFieldName,
        masterMapping,
        parentSelection,
        filterFields,
        pickFields,
        committedFilters: list.committedFilters,
    });

    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
    const [pendingEdit, setPendingEdit] = useState<Record<string, boolean> | null>(null);
    const [selected, setSelected] = useState<Row[]>([]);
    const [singleSelected, setSingleSelected] = useState<Row | null>(null);
    const allowEdit = schema.widget?.actions?.allowEdit !== false;
    const allowAdd = schema.widget?.actions?.allowAdd !== false && !pivotBaseRows;
    const allowDelete = schema.widget?.actions?.allowDelete !== false && !pivotBaseRows;
    const editable = !readOnly && allowEdit;
    // A pivot whose editable columns are all `cycle` cells is toggle-only: each
    // click commits a value, so the rows need no edit button at all.
    const cycleOnly =
        cols.some(c => isCycleCell(c.fieldSchema)) &&
        cols.every(c => isCycleCell(c.fieldSchema) || c.fieldSchema.readOnly === true);
    /**
     * A table whose cells are their own editors: no row-edit state, no pencil column,
     * every change written into the form value as it happens. The column is the unit
     * of refusal — a `readOnly` column still reads. `@@D-618`
     */
    const inlineEdit = !isListMode && editable && schema.widget?.inlineEdit === true;
    const needsRowEditor = !isListMode && editable && !cycleOnly && !inlineEdit;
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
        if (visibleRows.length > 0) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setSingleSelected(visibleRows[0]);
            fireSingleSelect(visibleRows[0]);
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
        visibleRows,
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
        (e: {data: Record<string, boolean>}) => {
            // A row that is no longer being edited leaves no picks behind: a cancelled
            // edit must not narrow the next one. @@D-617
            clearRowDrafts();
            setEditingRows(e.data);
        },
        [clearRowDrafts],
    );

    /**
     * Write one row back into the form value.  For a pivot table the row may not
     * exist in the value yet (its slot comes from the dropdown), so the merge is
     * keyed on the pivot's `join` fields — the same rule the row editor uses.
     */
    const mergeRow = useCallback(
        (rowData: Row): Row[] => {
            const {[KEY]: rowKey, ...rest} = rowData;
            if (pivotCfg) {
                const joinEntries = Object.entries(pivotCfg.join ?? {});
                const isMatch = (r: Row) => joinEntries.every(([, jk]) => r[jk] === rest[jk]);
                const updated = rows.some(isMatch)
                    ? rows.map(r => (isMatch(r) ? {...r, ...rest} : r))
                    : [...rows, rest];
                return updated.map(({[KEY]: _k, ...r}) => r);
            }
            const updated = rows.map(r => (r[KEY] === rowKey ? {...rest, [KEY]: rowKey} : r));
            return updated.map(({[KEY]: _k, ...r}) => r);
        },
        [rows, pivotCfg],
    );

    const onRowEditComplete = useCallback(
        (e: {newData: Row}) => {
            clearRowDrafts();
            onChange(mergeRow(e.newData));
        },
        [mergeRow, onChange, clearRowDrafts],
    );

    /**
     * Commit one cell value straight into the form value — how a cycle cell and an
     * in-place cell write, with the label and `lookup` fields a pick carries. `@@D-618`
     */
    const commitCell = useCallback(
        (rowData: Row, field: string, nextValue: unknown, patch?: Row) =>
            onChange(mergeRow({...rowData, ...patch, [field]: nextValue})),
        [mergeRow, onChange],
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
                value={list.searchInput}
                onChange={e => list.onSearchChange(e.target.value)}
                placeholder="Search…"
                data-testid="browse-search"
                style={{width: '9rem', paddingLeft: '1.75rem'}}
            />
            {list.searchInput && (
                <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-sm"
                    style={{position: 'absolute', right: 0, padding: '0.25rem'}}
                    type="button"
                    onClick={() => list.onSearchChange('')}
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
            <RowDraftContext value={rowDrafts}>
                <DataTable
                    key={dropdownSignature}
                    value={sortedRows}
                    // An in-place table never enters row editing: the cells are the
                    // editors, so there is no draft to save or cancel. @@D-618
                    editMode={!isListMode && editable && !inlineEdit ? 'row' : undefined}
                    editingRows={!isListMode && editable && !inlineEdit ? editingRows : undefined}
                    onRowEditChange={
                        !isListMode && editable && !inlineEdit ? onRowEditChange : undefined
                    }
                    onRowEditComplete={
                        !isListMode && editable && !inlineEdit ? onRowEditComplete : undefined
                    }
                    dataKey={dataKeyField}
                    size="small"
                    emptyMessage="No rows."
                    loading={isListMode ? list.loading : undefined}
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
                    removableSort
                    sortField={
                        isListMode ? (list.sortField ?? undefined) : (formSortField ?? undefined)
                    }
                    sortOrder={isListMode ? list.sortOrder : formSortOrder}
                    onSort={
                        isListMode
                            ? (e: {sortField: string; sortOrder: number}) => {
                                  const order = (e.sortOrder ?? 0) as 0 | 1 | -1;
                                  list.onSortChange(
                                      order === 0 ? null : (e.sortField ?? null),
                                      order === 0 ? 1 : order,
                                  );
                              }
                            : (e: {sortField: string; sortOrder: number}) => {
                                  const order = (e.sortOrder ?? 0) as 0 | 1 | -1;
                                  onFormSortChange(
                                      order === 0 ? null : (e.sortField ?? null),
                                      order === 0 ? 1 : order,
                                  );
                              }
                    }
                >
                    {!isSingleSelect && (editable || isListMode) && !pivotBaseRows && (
                        <Column
                            selectionMode="multiple"
                            style={{width: '3rem', flexGrow: 0}}
                        />
                    )}
                    {cols.map(({field, header, filter, sortable, fieldSchema}) => {
                        const widgetType = resolveWidgetType(fieldSchema);
                        const options = getColumnOptions(fieldSchema, resolvedDropdowns);
                        const isPickList = !!(
                            fieldSchema.widget?.dropdown || fieldSchema.widget?.options
                        );
                        const isNumeric = ['number', 'integer', 'currency', 'percent'].includes(
                            widgetType,
                        );
                        const isBoolType = ['boolean', 'checkbox'].includes(widgetType);

                        return (
                            <Column
                                key={field}
                                field={field}
                                header={
                                    filter ? (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.25rem',
                                            }}
                                        >
                                            <Text>{header}</Text>
                                            {isPickList ? (
                                                // A key column filters by picking the key,
                                                // the same way the cell is edited — typing a
                                                // substring can never match an id.
                                                <Dropdown
                                                    value={list.columnFilterInputs[field] ?? ''}
                                                    options={options}
                                                    onChange={e =>
                                                        list.onColumnFilterChange(
                                                            field,
                                                            (e.value as string) ?? '',
                                                        )
                                                    }
                                                    showClear
                                                    placeholder="Filter…"
                                                    className="p-inputtext-sm"
                                                    style={{width: '100%', fontSize: '0.8125rem'}}
                                                    onClick={e => e.stopPropagation()}
                                                    data-testid={`${tableId}-filter-${field}`}
                                                />
                                            ) : (
                                                <InputText
                                                    value={list.columnFilterInputs[field] ?? ''}
                                                    onChange={e =>
                                                        list.onColumnFilterChange(
                                                            field,
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="Filter…"
                                                    className="p-inputtext-sm"
                                                    style={{width: '100%', fontSize: '0.8125rem'}}
                                                    onClick={e => e.stopPropagation()}
                                                    data-testid={`${tableId}-filter-${field}`}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <Text>{header}</Text>
                                    )
                                }
                                sortable={sortable || isListMode}
                                alignHeader={isNumeric ? 'right' : undefined}
                                bodyClassName={isNumeric ? 'text-right' : undefined}
                                body={(rowData: Row, colOptions) => {
                                    const cellId = `${tableId}-${colOptions.rowIndex}-${field}`;
                                    const cellName = `${tableId}[${colOptions.rowIndex}].${field}`;
                                    /**
                                     * A cell that edits in place *is* its editor, so it
                                     * commits the moment it changes and there is nothing to
                                     * compare against: the value on screen is the value in
                                     * the form. @@D-618
                                     */
                                    if (
                                        inlineEdit &&
                                        !fieldSchema.readOnly &&
                                        !pivotJoinDataFields.has(field)
                                    ) {
                                        return (
                                            <InlineCellEditor
                                                rowData={rowData}
                                                field={field}
                                                options={options}
                                                fieldSchema={fieldSchema}
                                                commit={(nextValue: unknown) =>
                                                    commitCell(
                                                        rowData,
                                                        field,
                                                        nextValue,
                                                        pickPatch(fieldSchema, options, nextValue),
                                                    )
                                                }
                                                render={({
                                                    rowData: editedRow,
                                                    options: narrowed,
                                                    onDraft,
                                                }) =>
                                                    renderEditor(
                                                        widgetType,
                                                        fieldSchema,
                                                        field,
                                                        editedRow,
                                                        cellId,
                                                        cellName,
                                                        onDraft,
                                                        narrowed,
                                                    )
                                                }
                                            />
                                        );
                                    }
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
                                    const commit =
                                        editable && !fieldSchema.readOnly
                                            ? (nextValue: unknown) =>
                                                  commitCell(rowData, field, nextValue)
                                            : undefined;
                                    const node = renderBody(
                                        widgetType,
                                        field,
                                        rowData,
                                        cellId,
                                        options,
                                        keyFieldName,
                                        fieldSchema,
                                        commit,
                                        format,
                                    );
                                    // A cell that also carries the value it replaced shows
                                    // both, the current one first. The old value goes
                                    // through the same body, so a label, a date and a
                                    // currency read alike in both halves. @@D-615
                                    const compareField = fieldSchema.widget?.compare;
                                    if (
                                        !compareField ||
                                        rowData[compareField] === undefined ||
                                        String(rowData[compareField] ?? '') ===
                                            String(rowData[field] ?? '')
                                    ) {
                                        return node;
                                    }
                                    return (
                                        <span>
                                            <span
                                                data-testid={`${cellId}-new`}
                                                style={{color: 'var(--teal-500)'}}
                                            >
                                                {node}
                                            </span>
                                            <span
                                                data-testid={`${cellId}-old`}
                                                style={{
                                                    color: 'var(--orange-500)',
                                                    display: 'block',
                                                }}
                                            >
                                                {renderBody(
                                                    widgetType,
                                                    field,
                                                    {...rowData, [field]: rowData[compareField]},
                                                    `${cellId}-previous`,
                                                    options,
                                                    keyFieldName,
                                                    fieldSchema,
                                                    undefined,
                                                    format,
                                                )}
                                            </span>
                                        </span>
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
                                              const rowData = colOptions.rowData as Row;
                                              return (
                                                  <RowCellEditor
                                                      rowData={rowData}
                                                      options={options}
                                                      fieldSchema={fieldSchema}
                                                      render={(editedRow, narrowed) =>
                                                          renderEditor(
                                                              widgetType,
                                                              fieldSchema,
                                                              field,
                                                              rowData,
                                                              cellId,
                                                              cellName,
                                                              (v: unknown) => {
                                                                  // The row being edited is
                                                                  // PrimeReact's copy: mutating it is
                                                                  // how the label and `lookup` fields
                                                                  // reach `onRowEditComplete`. @@D-614
                                                                  Object.assign(
                                                                      rowData,
                                                                      pickPatch(
                                                                          fieldSchema,
                                                                          options,
                                                                          v,
                                                                      ),
                                                                  );
                                                                  recordRowDraft(rowData, field, v);
                                                                  colOptions.editorCallback?.(v);
                                                              },
                                                              narrowed,
                                                          )
                                                      }
                                                  />
                                              );
                                          }
                                        : undefined
                                }
                            />
                        );
                    })}
                    {needsRowEditor && (
                        <Column
                            rowEditor
                            style={{width: '7rem', textAlign: 'center'}}
                        />
                    )}
                </DataTable>
            </RowDraftContext>
            {isListMode && list.total > 0 && (
                <TablePaginator
                    first={list.first}
                    pageSize={list.pageSize}
                    total={list.total}
                    onFirstChange={list.setFirst}
                    onPageSizeChange={list.setPageSize}
                />
            )}
        </div>
    );
}
