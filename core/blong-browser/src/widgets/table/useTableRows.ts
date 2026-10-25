/**
 * Which rows a table shows, and in what order.
 *
 * Three sources meet here and only one of them applies: a detail table holds its rows
 * in the form value, a list table receives the page the server sent, and a pivot holds
 * a fixed set of slots that the stored rows are overlaid on. What follows is the same
 * in every mode — the parent's cascade, the column filters and the view sort — and it
 * stays on the client so a filter can hide a row without the form value losing it.
 */
import {useMemo, useState} from 'react';
import {KEY, type Row} from './model.js';

export interface ITableRowsOptions {
    /** The form value, for a detail table. */
    value: unknown;
    /** The page the server sent, for a list table. */
    listRows: Row[];
    isListMode: boolean;
    pivotCfg?: {
        examples?: Row[];
        dropdown?: string;
        join?: Record<string, string>;
        defaults?: Row;
    };
    /** The slots a pivot overlays stored rows onto, when they are known. */
    pivotBaseRows?: Row[];
    /** The field a cascaded table is narrowed by, and the keys it maps to the parent. */
    parentFieldName?: string;
    masterMapping?: Record<string, string>;
    parentSelection?: {row: Record<string, unknown>; index: number} | null;
    /** The columns that carry a filter, and the ones whose filter compares a key. */
    filterFields: string[];
    pickFields: Set<string>;
    /** What the filter inputs currently hold. */
    committedFilters: Record<string, string>;
}

export function useTableRows({
    value,
    listRows,
    isListMode,
    pivotCfg,
    pivotBaseRows,
    parentFieldName,
    masterMapping,
    parentSelection,
    filterFields,
    pickFields,
    committedFilters,
}: ITableRowsOptions) {
    const rows: Row[] = useMemo(
        () =>
            isListMode
                ? listRows
                : (Array.isArray(value) ? (value as Row[]) : []).map((row, i) => ({
                      ...row,
                      [KEY]: (row as Row)[KEY] ?? i,
                  })),
        [isListMode, listRows, value],
    );

    const pivotJoinDataFields = useMemo(
        () => new Set<string>(Object.values(pivotCfg?.join ?? {})),
        [pivotCfg],
    );

    // A pivot's slot for a stored row is found by the `join` fields, and a slot with
    // no stored row still shows — seeded with `defaults` and the join values, so the
    // reader can fill it in.
    const baseRows: Row[] = useMemo(() => {
        if (!pivotBaseRows) return rows;
        const joinEntries = Object.entries(pivotCfg?.join ?? {});
        return pivotBaseRows.map((pivotRow, i) => {
            const found = rows.find(row =>
                joinEntries.every(([pivotKey, rowKey]) => pivotRow[pivotKey] === row[rowKey]),
            );
            if (found) return {...pivotCfg?.defaults, ...found, [KEY]: `pivot-${i}`};
            const seeded: Row = {...pivotCfg?.defaults, [KEY]: `pivot-${i}`};
            for (const [pivotKey, rowKey] of joinEntries) {
                seeded[rowKey] = pivotRow[pivotKey];
            }
            return seeded;
        });
    }, [pivotBaseRows, pivotCfg, rows]);

    // The cascade is client-side here; a list table sends the same mapping to the
    // server instead, so it never reaches this filter.
    const filteredRows = useMemo(
        () =>
            !isListMode && parentFieldName && masterMapping
                ? parentSelection
                    ? baseRows.filter(row =>
                          Object.entries(masterMapping).every(
                              ([ownKey, parentKey]) =>
                                  row[ownKey] === parentSelection.row[parentKey],
                          ),
                      )
                    : []
                : baseRows,
        [isListMode, parentFieldName, masterMapping, parentSelection, baseRows],
    );

    // Display-only: a filter hides a row, it never removes it from the form value.
    const displayRows = useMemo(() => {
        if (isListMode || filterFields.length === 0) return filteredRows;
        const active = filterFields
            .map(field => [field, committedFilters[field] ?? ''] as const)
            .filter(([, text]) => text !== '');
        if (active.length === 0) return filteredRows;
        return filteredRows.filter(row =>
            active.every(([field, text]) =>
                pickFields.has(field)
                    ? String(row[field] ?? '') === text
                    : String(row[field] ?? '')
                          .toLocaleLowerCase()
                          .includes(text.toLocaleLowerCase()),
            ),
        );
    }, [isListMode, filteredRows, filterFields, pickFields, committedFilters]);

    /**
     * Sorting a form table reorders the view, not the value: a detail list keeps the
     * order the record was saved in, and the row key still identifies the row, so a
     * cell edit lands on the right one. The list mode sorts through the server.
     * @@D-615
     */
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<1 | -1>(1);
    const sortedRows = useMemo(() => {
        if (isListMode || !sortField) return displayRows;
        const direction = sortOrder;
        return [...displayRows].sort((left, right) => {
            const a = left[sortField];
            const b = right[sortField];
            // Empties last in either direction: a missing value says nothing about
            // its order among the values that exist.
            if (a == null || a === '') return b == null || b === '' ? 0 : 1;
            if (b == null || b === '') return -1;
            if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
            return String(a).localeCompare(String(b)) * direction;
        });
    }, [isListMode, displayRows, sortField, sortOrder]);

    return {
        /** The rows as the form holds them, each carrying the key an edit lands on. */
        rows,
        /** The rows the reader can see, before the view sort. */
        visibleRows: displayRows,
        /** What the table renders: narrowed by the cascade and the filters, then sorted. */
        sortedRows,
        sortField,
        sortOrder,
        /** Change the view's order; the stored order is untouched. */
        onSortChange: (field: string | null, order: 1 | -1) => {
            setSortField(field);
            setSortOrder(order);
        },
        /** The pivot's data fields, which a cell must not edit directly. */
        pivotJoinDataFields,
    };
}
