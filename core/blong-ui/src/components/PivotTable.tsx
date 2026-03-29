/**
 * PivotTable — static and dynamic pivot table support.
 *
 * Static pivot: pre-populate with `pivot.examples` data, join on `pivot.join`.
 * Dynamic pivot: populate from dropdown data via `pivot.dropdown`, join on `pivot.join`.
 */

import React, {useMemo} from 'react';

import type {BlongSchema, DropdownOption, DynamicPivot, StaticPivot} from '../types.js';
import {TableFactory} from '../factory/TableFactory.js';

/** Props for the PivotTable component. */
export interface PivotTableProps {
    /** Schema for the table. */
    schema: BlongSchema;
    /** Data rows from the API. */
    data: Record<string, unknown>[];
    /** Pivot configuration (static or dynamic). */
    pivot: StaticPivot | DynamicPivot;
    /** Dropdown options (for dynamic pivot). */
    dropdownOptions?: DropdownOption[];
    /** Total records for pagination. */
    totalRecords?: number;
    /** Selection mode. */
    selectionMode?: 'single' | 'multiple';
    /** CSS class name. */
    className?: string;
}

/**
 * Merge pivot seed rows with data rows.
 *
 * Pivot rows that have a matching join key in the data are enriched.
 * Pivot rows without matches are kept with empty data.
 */
function mergePivotData(
    pivotRows: Record<string, unknown>[],
    dataRows: Record<string, unknown>[],
    joinField: string,
): Record<string, unknown>[] {
    const dataMap = new Map<unknown, Record<string, unknown>>();
    for (const row of dataRows) {
        const key = row[joinField];
        if (key != null) {
            dataMap.set(key, row);
        }
    }

    return pivotRows.map(pivotRow => {
        const key = pivotRow[joinField];
        const dataRow = key != null ? dataMap.get(key) : undefined;
        return dataRow ? {...pivotRow, ...dataRow} : pivotRow;
    });
}

/**
 * Generate pivot seed rows from a static configuration.
 */
function staticPivotRows(pivot: StaticPivot): Record<string, unknown>[] {
    return pivot.examples;
}

/**
 * Generate pivot seed rows from a dynamic dropdown configuration.
 */
function dynamicPivotRows(
    pivot: DynamicPivot,
    dropdownOptions?: DropdownOption[],
): Record<string, unknown>[] {
    if (!dropdownOptions) return [];
    return dropdownOptions.map(opt => ({
        [pivot.join]: opt.value,
        _label: opt.label,
    }));
}

function isStaticPivot(pivot: StaticPivot | DynamicPivot): pivot is StaticPivot {
    return 'examples' in pivot;
}

/**
 * PivotTable — renders a table seeded with pivot rows merged with API data.
 *
 * @example
 * ```tsx
 * // Static pivot
 * <PivotTable
 *     schema={schema}
 *     data={apiData}
 *     pivot={{ examples: [{currencyCode: 'USD'}, {currencyCode: 'EUR'}], join: 'currencyCode' }}
 * />
 *
 * // Dynamic pivot
 * <PivotTable
 *     schema={schema}
 *     data={apiData}
 *     pivot={{ dropdown: 'currency', join: 'currencyCode' }}
 *     dropdownOptions={currencyOptions}
 * />
 * ```
 */
export function PivotTable({
    schema,
    data,
    pivot,
    dropdownOptions,
    totalRecords,
    selectionMode,
    className = '',
}: PivotTableProps): React.ReactElement {
    const mergedData = useMemo(() => {
        const seedRows = isStaticPivot(pivot)
            ? staticPivotRows(pivot)
            : dynamicPivotRows(pivot, dropdownOptions);
        return mergePivotData(seedRows, data, pivot.join);
    }, [pivot, data, dropdownOptions]);

    return React.createElement(TableFactory, {
        schema,
        data: mergedData,
        totalRecords: totalRecords ?? mergedData.length,
        selectionMode,
        className: `blong-pivot-table ${className}`,
    });
}
