import {Button} from 'primereact/button';
import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {Toolbar} from 'primereact/toolbar';
import {useCallback, useRef, useState} from 'react';
import type {IWidgetProps} from '../types/widget.js';

type Row = Record<string, unknown>;

const KEY = '__key';

/** Derive column definitions from schema.widget.columns and schema.items.properties */
function resolveColumns(
    widget: IWidgetProps['schema']['widget'],
    items: IWidgetProps['schema']['items'],
): {field: string; header: string; filter?: boolean; sortable?: boolean}[] {
    const cols = widget?.columns;
    if (cols && Array.isArray(cols)) {
        return cols.map(c => ({
            field: c,
            header: items?.properties?.[c]?.title ?? c,
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
    // Fall back to items.properties keys
    if (items?.properties) {
        return Object.entries(items.properties).map(([field, cfg]) => ({
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
    row[KEY] = Math.random();
    return row;
}

export function TableWidget({name, schema, value, onChange, readOnly, disabled}: IWidgetProps) {
    const cols = resolveColumns(schema.widget, schema.items);
    const colFields = cols.map(c => c.field);
    const rows: Row[] = (Array.isArray(value) ? (value as Row[]) : []).map((r, i) => ({
        ...r,
        [KEY]: (r as Row)[KEY] ?? i,
    }));

    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
    const [selected, setSelected] = useState<Row[]>([]);
    const pendingKeyRef = useRef<unknown>(null);
    const editable = !readOnly && !disabled;
    // When schema.widget.label is set, it acts as the card title inside the toolbar
    const widgetLabel = schema.widget?.label;

    const onRowEditChange = useCallback(
        (e: {data: Record<string, boolean>}) => setEditingRows(e.data),
        [],
    );

    const onRowEditComplete = useCallback(
        (e: {newData: Row; index: number}) => {
            const {[KEY]: k, ...rest} = e.newData;
            const updated = rows.map((r, i) => (i === e.index ? {...rest, [KEY]: k} : r));
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, onChange],
    );

    const addRow = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            const row = newRow(colFields);
            pendingKeyRef.current = row[KEY];
            const updated = [...rows, row];
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
            // Open the new row in edit mode on next render
            setEditingRows(prev => ({...prev, [updated.length - 1]: true}));
        },
        [rows, colFields, onChange],
    );

    const deleteSelected = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            const selectedKeys = new Set(selected.map(r => r[KEY]));
            const updated = rows.filter(r => !selectedKeys.has(r[KEY]));
            setSelected([]);
            onChange(updated.map(({[KEY]: _k, ...r}) => r));
        },
        [rows, selected, onChange],
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
            />
            <Button
                label="Delete"
                icon="pi pi-trash"
                className="p-button"
                onClick={deleteSelected}
                type="button"
                disabled={!selected.length}
            />
        </>
    ) : null;

    const toolbarLeft = widgetLabel ? (
        <span className="p-card-title">{widgetLabel}</span>
    ) : (
        actionButtons
    );
    const toolbarRight = widgetLabel ? actionButtons : null;

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
                value={rows}
                editMode={editable ? 'row' : undefined}
                editingRows={editable ? editingRows : undefined}
                onRowEditChange={editable ? onRowEditChange : undefined}
                onRowEditComplete={editable ? onRowEditComplete : undefined}
                dataKey={KEY}
                size="small"
                selection={selected}
                onSelectionChange={e => setSelected(e.value as Row[])}
                selectionMode="multiple"
            >
                <Column
                    selectionMode="multiple"
                    style={{width: '3rem', flexGrow: 0}}
                />
                {cols.map(({field, header, filter, sortable}) => (
                    <Column
                        key={field}
                        field={field}
                        header={header}
                        filter={filter}
                        sortable={sortable}
                        editor={
                            editable
                                ? options => (
                                      <input
                                          className="p-inputtext p-component w-full"
                                          value={String((options.rowData as Row)[field] ?? '')}
                                          onChange={e => options.editorCallback?.(e.target.value)}
                                      />
                                  )
                                : undefined
                        }
                    />
                ))}
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
