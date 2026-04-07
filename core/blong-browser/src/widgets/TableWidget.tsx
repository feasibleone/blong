import {Checkbox} from 'primereact/checkbox';
import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {Toolbar} from 'primereact/toolbar';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Button} from '../components/Button/index.js';
import {Text} from '../components/Text/index.js';
import type {IWidgetProps} from '../types/widget.js';

type Row = Record<string, unknown>;

const KEY = '__key';

/** Extract logical field name from parent path ('$.selected.person' → 'person', 'person' → 'person') */
function resolveParentField(parent?: string): string | undefined {
    if (!parent) return undefined;
    if (parent.startsWith('$.selected.')) return parent.slice('$.selected.'.length);
    return parent;
}

/** Derive column definitions from schema.widget.columns and schema.items.properties */
function resolveColumns(
    widget: IWidgetProps['schema']['widget'],
    items: IWidgetProps['schema']['items'],
): {field: string; header: string; filter?: boolean; sortable?: boolean}[] {
    const cols = widget?.columns;
    if (cols && Array.isArray(cols)) {
        return cols.map(c => ({
            field: c,
            header: ((items?.properties?.[c] as Record<string, unknown>)?.title as string) ?? c,
            filter: !!(items?.properties?.[c] as Record<string, unknown>)?.filter,
            sortable: !!(items?.properties?.[c] as Record<string, unknown>)?.sort,
        }));
    }
    if (cols && typeof cols === 'object') {
        return Object.entries(cols).map(([field, cfg]) => ({
            field,
            header: ((cfg as Record<string, unknown>).title as string) ?? field,
        }));
    }
    // Fall back to items.properties keys (excluding hidden fields)
    const hidden = new Set(widget?.hidden ?? []);
    const widgetCols = widget?.columns;
    const show = widgetCols
        ? Array.isArray(widgetCols)
            ? widgetCols
            : Object.keys(widgetCols)
        : null;
    if (items?.properties) {
        return Object.entries(items.properties)
            .filter(([field]) => !hidden.has(field) && (!show || show.includes(field)))
            .map(([field, cfg]) => ({
                field,
                header: ((cfg as Record<string, unknown>).title as string) ?? field,
                filter: !!(cfg as Record<string, unknown>).filter,
                sortable: !!(cfg as Record<string, unknown>).sort,
            }));
    }
    return [];
}

function newRow(cols: string[]): Row {
    const row = Object.fromEntries(cols.map(c => [c, '']));
    row[KEY] = Math.random().toString();
    return row;
}

export function TableWidget({
    name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
    onSelect,
    formValues,
}: IWidgetProps) {
    const cols = resolveColumns(schema.widget, schema.items);
    const colFields = cols.map(c => c.field);
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
    const [selected, setSelected] = useState<Row[]>([]);
    const [singleSelected, setSingleSelected] = useState<Row | null>(null);
    const pendingKeyRef = useRef<unknown>(null);
    const allowEdit = schema.widget?.actions?.allowEdit !== false;
    const editable = !readOnly && allowEdit;
    const interactionDisabled = disabled || readOnly;
    const isSingleSelect = schema.widget?.selectionMode === 'single';
    // When schema.widget.label is set, it acts as the card title inside the toolbar
    const widgetLabel = schema.widget?.label;

    // Helper: fire onSelect with row + original index in full `rows` array
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

    // Row class — apply outline to the currently selected single-select row
    const rowClass = useCallback(
        (data: Row) =>
            isSingleSelect && singleSelected && data[KEY] === singleSelected[KEY]
                ? 'blong-table-current'
                : '',
        [isSingleSelect, singleSelected],
    );

    // Auto-select first filtered row when parent selection changes.
    // prevParentKeyRef starts at null (same as curKey when no parent selected) to avoid
    // a spurious onSelect(null) call on mount.
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

    const onRowEditChange = useCallback(
        (e: {data: Record<string, boolean>}) => setEditingRows(e.data),
        [],
    );

    const onRowEditComplete = useCallback(
        (e: {newData: Row}) => {
            // Use the row's KEY to find the original position in the unfiltered rows array.
            // e.index would be the index in filteredRows (not rows), so we can't use it.
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
            const row = newRow(colFields);
            // For child tables (cascaded), auto-fill FK fields from the parent selection
            if (parentSelection && masterMapping) {
                for (const [ownKey, parentKey] of Object.entries(masterMapping)) {
                    row[ownKey] = parentSelection.row[String(parentKey)];
                }
            }
            pendingKeyRef.current = row[KEY];
            const updated = [...rows, row];
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
            // Open the new row in edit mode; key by the row's KEY (not array index)
            setEditingRows(prev => ({...prev, [String(row[KEY])]: true}));
        },
        [rows, colFields, onChange, parentSelection, masterMapping],
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
            onSelect?.(null); // clear child cascades
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, selected, singleSelected, onChange, onSelect],
    );

    // Toolbar layout:
    // - when widget.label is set: left=title, right=buttons (label acts as card title)
    // - otherwise: left=buttons, right=null
    const actionButtons = editable ? (
        <>
            <Button
                label="Add"
                icon="pi pi-plus"
                className="p-button mr-2"
                onClick={addRow}
                type="button"
                disabled={interactionDisabled}
            />
            <Button
                label="Delete"
                icon="pi pi-trash"
                className="p-button"
                onClick={deleteSelected}
                type="button"
                disabled={interactionDisabled || (!selected.length && !singleSelected)}
            />
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

    // When this table is a child in a cascaded layout, don't render anything until
    // the parent has an active selection. This prevents stale/uncascaded data showing.
    if (parentFieldName && masterMapping && !parentSelection) return null;

    return (
        <div className="blong-table-widget w-full">
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
                onSelectionChange={e => {
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
                {cols.map(({field, header, filter, sortable}) => {
                    const fieldSchema = schema.items?.properties?.[field] as
                        | Record<string, unknown>
                        | undefined;
                    const isBool = fieldSchema?.type === 'boolean';
                    return (
                        <Column
                            key={field}
                            field={field}
                            header={<Text>{header}</Text>}
                            filter={filter}
                            sortable={sortable}
                            body={
                                isBool
                                    ? (rowData: Row) => (
                                          // Stop click propagation so the inline boolean toggle
                                          // doesn't also trigger DataTable row-selection change.
                                          <span onClick={e => e.stopPropagation()}>
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
                                                      onChange(
                                                          updated.map(({[KEY]: _k, ...r}) => r),
                                                      );
                                                  }}
                                                  disabled={readOnly || disabled}
                                              />
                                          </span>
                                      )
                                    : undefined
                            }
                            editor={
                                editable && !isBool
                                    ? options => (
                                          <input
                                              className="p-inputtext p-component w-full"
                                              value={String((options.rowData as Row)[field] ?? '')}
                                              onChange={e =>
                                                  options.editorCallback?.(e.target.value)
                                              }
                                          />
                                      )
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
