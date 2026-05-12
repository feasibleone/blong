/**
 * Report — read-only data viewer with export capabilities.
 *
 * Combines a filter bar, a summary section (cards), and a detail DataTable.
 * Designed for print/export-oriented display of aggregated data.
 */
import {Column, DataTable, Panel, Skeleton, Toolbar} from '../../primereact/index.js';

import type {IEnrichedSchema} from '@feasibleone/blong';
import {useState} from 'react';
import {useAction} from '../../hooks/useAction.js';
import {Button} from '../Button/Button.js';
import {Form} from '../Form/Form.js';

export interface IReportColumn {
    field: string;
    header?: string;
    sortable?: boolean;
    width?: string | number;
    /** Aggregate function for footer */
    aggregate?: 'sum' | 'count' | 'avg';
}

export interface IReportSummaryMetric {
    label: string;
    /** Field path from the report data */
    field: string;
    icon?: string;
    /** Color class */
    color?: 'success' | 'warn' | 'danger' | 'info';
}

export interface IReportProps {
    /** Action name returning report data */
    dataAction?: string;

    /** Schema for the filter form */
    filterSchema?: IEnrichedSchema;
    /** Initial filter values */
    defaultFilter?: Record<string, unknown>;

    /** Columns for the detail table */
    columns?: IReportColumn[];

    /** Summary metric definitions shown above the table */
    metrics?: IReportSummaryMetric[];

    /** Title */
    title?: string;

    /** Enable CSV/XLS/PDF export buttons */
    exportable?: boolean;

    className?: string;
}

type ReportRow = Record<string, unknown>;

export function Report({
    dataAction = '',
    filterSchema,
    defaultFilter,
    columns = [],
    metrics = [],
    title,
    exportable = true,
    className = '',
}: IReportProps) {
    const [filter, setFilter] = useState<Record<string, unknown>>(defaultFilter ?? {});

    const {data, loading, refetch} = useAction<{
        rows: ReportRow[];
        summary?: Record<string, unknown>;
    }>(dataAction, 'query', filter);

    const rows: ReportRow[] = data?.rows ?? [];
    const summary = data?.summary ?? {};

    const exportCSV = () => {
        if (!rows.length) return;
        const headers = columns.map(c => c.header ?? c.field).join(',');
        const body = rows
            .map(r => columns.map(c => JSON.stringify(r[c.field] ?? '')).join(','))
            .join('\n');
        const blob = new Blob([`${headers}\n${body}`], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title ?? 'report'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`blong-report ${className}`}>
            {/* Filter form */}
            {filterSchema && (
                <Panel
                    header="Filters"
                    toggleable
                    collapsed={!defaultFilter}
                    className="blong-report-filters"
                >
                    <Form
                        schema={filterSchema}
                        value={filter}
                        onChange={setFilter}
                        readOnly={false}
                        loading={loading}
                    />
                    <Button
                        label="Run Report"
                        icon="pi pi-play"
                        onClick={() => refetch?.()}
                        loading={loading}
                        className="blong-report-run"
                    />
                </Panel>
            )}

            {/* Summary metrics */}
            {metrics.length > 0 && (
                <div className="blong-report-metrics">
                    {metrics.map(metric => (
                        <div
                            key={metric.field}
                            className={`blong-report-metric blong-report-metric--${metric.color ?? 'info'}`}
                        >
                            {metric.icon && (
                                <i className={`pi ${metric.icon} blong-report-metric__icon`} />
                            )}
                            <div className="blong-report-metric__value">
                                {loading ? (
                                    <Skeleton
                                        width="60px"
                                        height="1.5rem"
                                    />
                                ) : (
                                    String(
                                        summary[metric.field] ??
                                            rows.reduce(
                                                (acc, r) => acc + Number(r[metric.field] ?? 0),
                                                0,
                                            ),
                                    )
                                )}
                            </div>
                            <div className="blong-report-metric__label">{metric.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Data table */}
            <div className="blong-report-table">
                <Toolbar
                    left={title ? <h3 className="blong-report-title">{title}</h3> : undefined}
                    right={
                        <div>
                            <Button
                                icon="pi pi-refresh"
                                className="p-button-text"
                                onClick={() => refetch?.()}
                                tooltip="Refresh"
                            />
                            {exportable && (
                                <Button
                                    icon="pi pi-download"
                                    className="p-button-text"
                                    onClick={exportCSV}
                                    tooltip="Export CSV"
                                />
                            )}
                        </div>
                    }
                    className="blong-report-toolbar"
                />
                <DataTable
                    value={rows}
                    loading={loading}
                    sortMode="multiple"
                    removableSort
                    scrollable
                    scrollHeight="flex"
                    paginator
                    rows={50}
                    rowsPerPageOptions={[25, 50, 100, 500]}
                    emptyMessage="No data."
                    size="small"
                    className="blong-report-dt"
                >
                    {columns.map(col => (
                        <Column
                            key={col.field}
                            field={col.field}
                            header={col.header ?? col.field}
                            sortable={col.sortable !== false}
                            style={col.width ? {width: col.width} : undefined}
                            footer={
                                col.aggregate === 'sum'
                                    ? String(
                                          rows.reduce(
                                              (acc, r) => acc + Number(r[col.field] ?? 0),
                                              0,
                                          ),
                                      )
                                    : col.aggregate === 'count'
                                      ? String(rows.length)
                                      : undefined
                            }
                        />
                    ))}
                </DataTable>
            </div>
        </div>
    );
}
