import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {InputText} from 'primereact/inputtext';
import {useState} from 'react';
import {DiagramViewer, useBlong, useText} from '@feasibleone/blong-browser';
import {useRealmCall, useRealmRead} from './useRealmData.js';

/**
 * What has been observed, and what one execution looked like.
 *
 * Two reads of one service: the kinds it has seen with their executions, and the
 * diagram of whichever execution is selected. The diagram is a *text* diagram
 * drawn by `DiagramViewer`, and which renderer draws it comes from the realm's
 * own configuration — a deployment that wants a different notation changes a
 * config value, not this page.
 */

interface IFlowSummary {
    id?: string;
    kind?: string;
    services?: string[];
    legs?: {leg: string}[];
}

interface IFlowUnion {
    kind?: string;
    executions?: number;
    legs?: {leg: string; count: number; ends?: {caller: string; callee: string}[]}[];
}

interface IFlows {
    unions?: IFlowUnion[];
    executions?: IFlowSummary[];
}

/** The realm's configured notation, defaulted where a deployment has not chosen one. */
function rendererName(config: unknown): string {
    const realm = (config as {blong?: {diagram?: {renderer?: string}}} | undefined)?.blong;
    return realm?.diagram?.renderer ?? 'mermaid';
}

export function Flow() {
    const {config} = useBlong();
    const flows = useRealmRead<IFlows>('blong.flow.find');
    const [diagram, setDiagram] = useState<string>();
    const [filter, setFilter] = useState('');
    const call = useRealmCall();

    const showDiagram = async (reference: string): Promise<void> => {
        const {data, error} = await call('blong.flow.get', {reference});
        setDiagram(
            error === undefined
                ? (data as {diagram?: string})?.diagram
                : `the service did not draw ${reference}: ${error}`,
        );
    };

    return (
        <div className="flex flex-column gap-3">
            {flows.error !== undefined && <small className="text-red-500">{flows.error}</small>}
            <InputText
                data-testid="browse-search"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder={useText('Filter')}
            />
            <DataTable
                value={flows.data?.executions ?? []}
                loading={flows.loading}
                globalFilter={filter}
                globalFilterFields={['kind', 'id']}
                selectionMode="single"
                onSelectionChange={event => {
                    const row = event.value as IFlowSummary;
                    if (row.id !== undefined) void showDiagram(row.id);
                }}
                dataKey="id"
                emptyMessage={useText('Nothing observed yet')}
            >
                <Column field="kind" header={useText('Kind')} />
                <Column
                    field="id"
                    header={useText('Execution')}
                    // Masked in captures: an execution id is minted per execution, so
                    // it can never be the same value twice.
                    body={(row: IFlowSummary) => (
                        <span data-testid="flow-execution">{row.id ?? ''}</span>
                    )}
                />
                <Column
                    header={useText('Calls')}
                    body={(row: IFlowSummary) => row.legs?.length ?? 0}
                />
                <Column
                    header={useText('Services')}
                    body={(row: IFlowSummary) => (row.services ?? []).join(', ')}
                />
            </DataTable>
            {diagram !== undefined && (
                <DiagramViewer diagram={diagram} renderer={rendererName(config)} />
            )}
        </div>
    );
}
