import {Button} from 'primereact/button';
import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {useState} from 'react';
import type {IWidgetProps} from '../types/widget.js';

type Row = Record<string, unknown>;

function newRow(columns: string[]): Row {
    return Object.fromEntries(columns.map(c => [c, null]));
}

export function TableWidget({
    name: _name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {columns = []} = schema.widget ?? {};
    const rows: Row[] = Array.isArray(value) ? (value as Row[]) : [];
    const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});

    const onRowEditChange = (e: {data: Record<string, boolean>}) => setEditingRows(e.data);

    const onRowEditSave = (e: {data: Row; index: number}) => {
        const updated = rows.map((r, i) => (i === e.index ? e.data : r));
        onChange(updated);
    };

    const addRow = () => onChange([...rows, newRow(columns as string[])]);

    const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

    return (
        <div className="blong-table-widget">
            <DataTable
                value={rows}
                editMode="row"
                editingRows={editingRows}
                onRowEditChange={onRowEditChange}
                onRowEditSave={onRowEditSave}
                dataKey="_idx"
                size="small"
            >
                {(columns as string[]).map(col => (
                    <Column
                        key={col}
                        field={col}
                        header={col}
                        editor={
                            readOnly || disabled
                                ? undefined
                                : options => (
                                      <input
                                          className="p-inputtext p-component"
                                          value={String((options.rowData as Row)[col] ?? '')}
                                          onChange={e => options.editorCallback?.(e.target.value)}
                                      />
                                  )
                        }
                    />
                ))}
                {!readOnly && !disabled && (
                    <Column
                        rowEditor
                        header={
                            <Button
                                icon="pi pi-plus"
                                className="p-button-text p-button-sm"
                                onClick={addRow}
                                type="button"
                            />
                        }
                        body={(_row: Row, {rowIndex}: {rowIndex: number}) => (
                            <Button
                                icon="pi pi-trash"
                                className="p-button-text p-button-sm p-button-danger"
                                onClick={() => removeRow(rowIndex)}
                                type="button"
                            />
                        )}
                    />
                )}
            </DataTable>
        </div>
    );
}
