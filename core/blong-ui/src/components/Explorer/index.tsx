/**
 * Explorer — DataTable + filter panel + toolbar + optional tree navigator.
 *
 * Renders a configurable list/grid view backed by query/mutation actions.
 * Supports inline selection, sorting, filtering, pagination, and row actions.
 */
import {Button} from 'primereact/button';
import {Column} from 'primereact/column';
import {
    DataTable,
    type DataTableSelectionMultipleChangeEvent,
    type DataTableSelectionSingleChangeEvent,
} from 'primereact/datatable';
import {InputText} from 'primereact/inputtext';
import {Splitter, SplitterPanel} from 'primereact/splitter';
import {Toolbar} from 'primereact/toolbar';
import {useCallback, useMemo, useRef, useState} from 'react';
import {useBlongUi} from '../../context/BlongUiContext.js';
import {useAction} from '../../hooks/useAction.js';
import type {IToolbarButton} from '../../types/action.js';
import type {IEnrichedSchema} from '../../types/widget.js';
import {ActionButton} from '../ActionButton/index.js';
import {Navigator} from '../Navigator/index.js';

export interface IExplorerColumn {
    field: string;
    header?: string;
    sortable?: boolean;
    filterable?: boolean;
    width?: string | number;
    /** Custom body template — action name returning a cell value */
    action?: string;
}

export interface IExplorerProps {
    /** Schema for the entity list items */
    schema?: IEnrichedSchema;
    /** Explicit column definitions; if omitted, derived from schema */
    columns?: IExplorerColumn[];
    /** Action name that loads the list */
    listAction?: string;
    /** Static params for the list action */
    listParams?: Record<string, unknown>;

    /** Selection mode */
    selectionMode?: 'single' | 'multiple' | 'none';
    onSelectionChange?: (value: Record<string, unknown> | Record<string, unknown>[]) => void;

    /** Toolbar buttons (left) */
    toolbar?: IToolbarButton[];
    /** Toolbar buttons (right) */
    toolbarRight?: IToolbarButton[];

    /** Show a Navigator tree on the left */
    navigator?: {
        /** Action name for tree fetch */
        listAction: string;
        /** Field used as node key */
        keyField?: string;
        /** Field used as node label */
        labelField?: string;
        /** Field used as parent key (for building tree) */
        parentField?: string;
    };

    /** Row size */
    size?: 'small' | 'normal' | 'large';

    className?: string;
}

type RowData = Record<string, unknown>;

export function Explorer({
    schema,
    columns: columnsProp,
    listAction = '',
    listParams,
    selectionMode = 'single',
    onSelectionChange,
    toolbar = [],
    toolbarRight = [],
    navigator,
    size = 'small',
    className = '',
}: IExplorerProps) {
    const [selection, setSelection] = useState<RowData | RowData[] | null>(null);
    const [globalFilter, setGlobalFilter] = useState<string>('');
    const [navigatorFilter, setNavigatorFilter] = useState<Record<string, unknown>>({});
    const dt = useRef<DataTable<RowData[]>>(null);
    const {dispatch} = useBlongUi();

    // Merge static params with navigator branch filter
    const mergedParams = useMemo(
        () => ({...(listParams ?? {}), ...navigatorFilter}),
        [listParams, navigatorFilter],
    );

    const {data, loading, refetch} = useAction<RowData[]>(listAction, mergedParams);
    const rows: RowData[] = Array.isArray(data) ? data : [];

    // Derive columns from schema if not explicitly provided
    const columns = useMemo((): IExplorerColumn[] => {
        if (columnsProp) return columnsProp;
        const props = schema?.properties ?? {};
        return Object.entries(props)
            .filter(([, f]) => !f['x-filter'] && !f.readOnly)
            .slice(0, 8)
            .map(([field, f]) => ({
                field,
                header: f.title ?? field,
                sortable: f['x-sort'] !== false,
            }));
    }, [columnsProp, schema]);

    const handleSelection = useCallback(
        (
            e:
                | DataTableSelectionSingleChangeEvent<RowData[]>
                | DataTableSelectionMultipleChangeEvent<RowData[]>,
        ) => {
            const val = e.value as RowData | RowData[];
            setSelection(Array.isArray(val) ? val : val);
            onSelectionChange?.(val as RowData | RowData[]);
        },
        [onSelectionChange],
    );

    const tableContent = (
        <div className="blong-explorer-table">
            {/* Toolbar */}
            <Toolbar
                start={
                    <div className="blong-toolbar-left">
                        <Button
                            icon="pi pi-refresh"
                            className="p-button-text"
                            onClick={() => refetch?.()}
                            tooltip="Refresh"
                        />
                        {toolbar.map((btn, i) => (
                            <ActionButton
                                key={i}
                                {...btn}
                            />
                        ))}
                    </div>
                }
                end={
                    <div className="blong-toolbar-right">
                        <span className="p-input-icon-left">
                            <i className="pi pi-search" />
                            <InputText
                                value={globalFilter}
                                onChange={e => setGlobalFilter(e.target.value)}
                                placeholder="Search…"
                                className="blong-explorer-search"
                            />
                        </span>
                        {toolbarRight.map((btn, i) => (
                            <ActionButton
                                key={i}
                                {...btn}
                            />
                        ))}
                    </div>
                }
                className="blong-explorer-toolbar"
            />

            <DataTable
                ref={dt}
                value={rows}
                size={size}
                loading={loading}
                selection={selection ?? undefined}
                onSelectionChange={handleSelection}
                selectionMode={selectionMode === 'none' ? undefined : selectionMode}
                globalFilter={globalFilter}
                paginator
                rows={25}
                rowsPerPageOptions={[10, 25, 50, 100]}
                sortMode="multiple"
                removableSort
                scrollable
                scrollHeight="flex"
                className="blong-explorer-dt"
                emptyMessage="No records found."
            >
                {selectionMode !== 'none' && (
                    <Column
                        selectionMode={selectionMode === 'multiple' ? 'multiple' : 'single'}
                        style={{width: 40}}
                    />
                )}
                {columns.map(col => (
                    <Column
                        key={col.field}
                        field={col.field}
                        header={col.header ?? col.field}
                        sortable={col.sortable !== false}
                        filter={col.filterable}
                        style={col.width ? {width: col.width} : undefined}
                    />
                ))}
            </DataTable>
        </div>
    );

    if (!navigator) {
        return <div className={`blong-explorer ${className}`}>{tableContent}</div>;
    }

    return (
        <div className={`blong-explorer blong-explorer--with-nav ${className}`}>
            <Splitter style={{height: '100%'}}>
                <SplitterPanel
                    size={20}
                    minSize={15}
                >
                    <Navigator
                        fetch={
                            navigator.listAction
                                ? () =>
                                      dispatch(navigator.listAction, {}) as Promise<
                                          Record<string, unknown[]>
                                      >
                                : undefined
                        }
                        keyField={navigator.keyField ?? 'id'}
                        parentField={navigator.parentField ?? 'parentId'}
                        field={navigator.labelField ?? 'name'}
                        onSelect={node =>
                            setNavigatorFilter(
                                node ? {parentId: node[navigator.keyField ?? 'id']} : {},
                            )
                        }
                    />
                </SplitterPanel>
                <SplitterPanel size={80}>{tableContent}</SplitterPanel>
            </Splitter>
        </div>
    );
}
