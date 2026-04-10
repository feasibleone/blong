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

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Button} from '../components/Button/index.js';
import {Text} from '../components/Text/index.js';
import type {IEnrichedFieldSchema, IWidgetProps} from '../types/widget.js';
import {dateIn, dateOut} from './DateWidget.js';

type Row = Record<string, unknown>;
type DropdownOption = {value: unknown; label: string; [k: string]: unknown};

const KEY = '__key';

function resolveWidgetType(schema: IEnrichedFieldSchema): string {
    if (schema.widget?.type) return schema.widget.type;
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
): React.ReactNode {
    const value = rowData[field];

    switch (widgetType) {
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

export function TableWidget({
    id,
    name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
    onSelect,
    formValues,
    dropdowns,
}: IWidgetProps) {
    const cols = resolveColumns(schema.widget, schema.items);
    const colFields = cols.map(c => c.field);
    const tableId = id ?? name;
    const properties = schema.items?.properties as Record<string, IEnrichedFieldSchema> | undefined;

    const rows: Row[] = (Array.isArray(value) ? (value as Row[]) : []).map((r, i) => ({
        ...r,
        [KEY]: (r as Row)[KEY] ?? i,
    }));

    // ── Cascaded table filtering ───────────────────────────────────────────
    const parentFieldName = resolveParentField(schema.widget?.parent);
    const masterMapping = schema.widget?.master;
    const parentSelection = parentFieldName
        ? (formValues?.['__sel_' + parentFieldName] as
              | {row: Record<string, unknown>; index: number}
              | null
              | undefined)
        : undefined;

    const filteredRows =
        parentFieldName && masterMapping
            ? parentSelection
                ? rows.filter(r =>
                      Object.entries(masterMapping).every(
                          ([ownKey, parentKey]) => r[ownKey] === parentSelection.row[parentKey],
                      ),
                  )
                : []
            : rows;

    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
    const [pendingEdit, setPendingEdit] = useState<Record<string, boolean> | null>(null);
    const [selected, setSelected] = useState<Row[]>([]);
    const [singleSelected, setSingleSelected] = useState<Row | null>(null);
    const allowEdit = schema.widget?.actions?.allowEdit !== false;
    const allowAdd = schema.widget?.actions?.allowAdd !== false;
    const allowDelete = schema.widget?.actions?.allowDelete !== false;
    const editable = !readOnly && allowEdit;
    const interactionDisabled = disabled || readOnly;
    const isSingleSelect = schema.widget?.selectionMode === 'single';
    const widgetLabel = schema.widget?.label;

    const fireSingleSelect = useCallback(
        (row: Row | null) => {
            if (!row) {
                onSelect?.(null);
                return;
            }
            const {[KEY]: _k, ...clean} = row;
            const originalIndex = rows.findIndex(r => r[KEY] === row[KEY]);
            onSelect?.({row: clean as Record<string, unknown>, index: originalIndex});
        },
        [rows, onSelect],
    );

    const rowClass = useCallback(
        (data: Row) =>
            isSingleSelect && singleSelected && data[KEY] === singleSelected[KEY]
                ? 'blong-table-current'
                : '',
        [isSingleSelect, singleSelected],
    );

    const prevParentKeyRef = useRef<unknown>(null);
    useEffect(() => {
        if (!schema.widget?.autoSelect || !parentFieldName) return;
        const curKey = parentSelection ? parentSelection.index : null;
        if (prevParentKeyRef.current === curKey) return;
        prevParentKeyRef.current = curKey;
        if (filteredRows.length > 0) {
            setSingleSelected(filteredRows[0]);
            fireSingleSelect(filteredRows[0]);
        } else {
            setSingleSelected(null);
            onSelect?.(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentSelection?.index, parentFieldName, schema.widget?.autoSelect]);

    useEffect(() => {
        if (!pendingEdit) return;
        setPendingEdit(null);
        setEditingRows(prev => ({...prev, ...pendingEdit}));
    }, [pendingEdit]);

    const onRowEditChange = useCallback(
        (e: {data: Record<string, boolean>}) => setEditingRows(e.data),
        [],
    );

    const onRowEditComplete = useCallback(
        (e: {newData: Row}) => {
            const {[KEY]: k, ...rest} = e.newData;
            const matchKey = e.newData[KEY];
            const updated = rows.map(r => (r[KEY] === matchKey ? {...rest, [KEY]: k} : r));
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, onChange],
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
            onSelect?.(null);
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, selected, singleSelected, onChange, onSelect],
    );

    const actionButtons = editable ? (
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

    const toolbarLeft = widgetLabel ? (
        <span className="p-card-title">
            <Text>{widgetLabel}</Text>
        </span>
    ) : (
        actionButtons
    );
    const toolbarRight = widgetLabel ? actionButtons : null;

    if (parentFieldName && masterMapping && !parentSelection) return null;

    return (
        <div
            data-testid={`${tableId}`}
            className="blong-table-widget w-full"
        >
            {(editable || widgetLabel) && (
                <Toolbar
                    left={toolbarLeft}
                    right={toolbarRight ?? undefined}
                    className="p-0 border-none"
                    style={{background: 'none'}}
                />
            )}
            <DataTable
                value={filteredRows}
                editMode={editable ? 'row' : undefined}
                editingRows={editable ? editingRows : undefined}
                onRowEditChange={editable ? onRowEditChange : undefined}
                onRowEditComplete={editable ? onRowEditComplete : undefined}
                dataKey={KEY}
                size="small"
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
            >
                {!isSingleSelect && editable && (
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
                            header={<Text>{header}</Text>}
                            filter={filter}
                            sortable={sortable}
                            alignHeader={isNumeric ? 'right' : undefined}
                            bodyClassName={isNumeric ? 'text-right' : undefined}
                            body={(rowData: Row, colOptions) => {
                                const cellId = `${tableId}-${colOptions.rowIndex}-${field}`;
                                if (isBoolType) {
                                    return (
                                        <span
                                            data-testid={cellId}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                checked={Boolean(rowData[field])}
                                                onChange={e => {
                                                    if (readOnly || disabled) return;
                                                    const matchKey = rowData[KEY];
                                                    const updated = rows.map(r =>
                                                        r[KEY] === matchKey
                                                            ? {...r, [field]: e.checked}
                                                            : r,
                                                    );
                                                    onChange(updated.map(({[KEY]: _k, ...r}) => r));
                                                }}
                                                disabled={readOnly || disabled}
                                            />
                                        </span>
                                    );
                                }
                                return renderBody(widgetType, field, rowData, cellId, options);
                            }}
                            editor={
                                editable && !isBoolType
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
                {editable && (
                    <Column
                        rowEditor
                        style={{width: '7rem', textAlign: 'center'}}
                    />
                )}
            </DataTable>
        </div>
    );
}
