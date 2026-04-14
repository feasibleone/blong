import {Column, DataTable, type DataTableSelectionChangeParams} from '../primereact/index.js';

import type {IDropdownOption} from '@feasibleone/blong';
import {useEffect, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import type {IWidgetProps} from '../types/widget.js';

type Row = IDropdownOption & Record<string, unknown>;

function toOptions(data: unknown): Row[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => ({
        ...item,
        label: String(item.label ?? item.name ?? item.value ?? item),
        value: item.value ?? item,
    }));
}

/**
 * SelectTableWidget — DataTable with row selection.
 * Source rows come from the dropdown registry (same as `dropdown`).
 * `value` stores the selected row's `value` key (single mode) or an array of keys (multi mode).
 */
export function SelectTableWidget({
    id,
    name: _name,
    schema,
    value,
    onChange,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {
        fetch: fetchAction,
        options: staticOptions,
        dropdown: dropdownKey,
        selectionMode = 'single',
        columns,
    } = schema.widget ?? {};
    const {dispatch} = useBlongUi();
    const [rows, setRows] = useState<Row[]>(staticOptions ? toOptions(staticOptions) : []);

    useEffect(() => {
        if (staticOptions) return;
        let cancelled = false;

        if (dropdownKey) {
            const loader = (key: string) =>
                (
                    dispatch('portal.dropdown.list', {names: [key]}) as Promise<
                        Record<string, unknown>
                    >
                ).then(result => toOptions(result[key]));
            dropdownRegistry
                .get(dropdownKey, loader)
                .then(data => {
                    if (!cancelled) setRows(data as Row[]);
                })
                .catch(() => {});
            return () => {
                cancelled = true;
            };
        }

        if (!fetchAction) return;
        (dispatch(fetchAction, {}) as Promise<unknown>)
            .then(data => {
                if (!cancelled) setRows(toOptions(data));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fetchAction, dropdownKey, dispatch, staticOptions]);

    const isSingle = selectionMode === 'single';

    // Map stored value keys back to row objects for the DataTable
    const selectedRows = isSingle
        ? (rows.find(r => r.value === value) ?? null)
        : rows.filter(r => (value as unknown[])?.includes(r.value));

    // Derive columns from schema.widget.columns or fall back to label
    const cols: string[] = Array.isArray(columns)
        ? (columns as string[])
        : ((columns ? Object.keys(columns as object) : null) ??
          (schema.items?.properties ? Object.keys(schema.items.properties) : ['label']));

    const colHeaders: Record<string, string> = schema.items?.properties
        ? Object.fromEntries(
              Object.entries(schema.items.properties as Record<string, {title?: string}>).map(
                  ([k, v]) => [k, v.title ?? k],
              ),
          )
        : {};

    return (
        <DataTable
            value={rows}
            dataKey="value"
            data-testid={id ?? _name}
            size="small"
            selectionMode={isSingle ? 'single' : 'multiple'}
            selection={selectedRows}
            onSelectionChange={(e: DataTableSelectionChangeParams) => {
                if (disabled || readOnly) return;
                if (isSingle) {
                    onChange((e.value as Row | null)?.value ?? null);
                } else {
                    onChange((e.value as Row[]).map(r => r.value));
                }
            }}
            metaKeySelection={false}
            className={`blong-select-table w-full ${error ? 'p-invalid' : ''}`}
        >
            {cols.map(field => (
                <Column
                    key={field}
                    field={field}
                    header={colHeaders[field] ?? field}
                />
            ))}
        </DataTable>
    );
}
