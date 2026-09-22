import {DiagramViewer, useBlong, useText} from '@feasibleone/blong-browser';
import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {InputText} from 'primereact/inputtext';
import {useState} from 'react';
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
        <div
            className="flex flex-column gap-3"
            // The page fills the tab it was given and hands the leftover height to the
            // diagram. A sequence of a long flow is thousands of pixels tall, and a page
            // that lets it take its natural height is *clipped* by the shell — measured on
            // the gateway's test flow: 4484px of content in a 664px panel, with no
            // scrollbar anywhere to reach the rest of it.
            style={{height: '100%', minHeight: 0}}
        >
            {flows.error !== undefined && <small className="text-red-500">{flows.error}</small>}
            <InputText
                data-testid="browse-search"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder={useText('Filter')}
                style={{flexShrink: 0}}
            />
            {/* The list and the diagram each get a box of their own and scroll inside it:
                between them they hold everything the panel was given, so the page never
                outgrows it. A list of every execution the process has served is as long as
                the service has been up, and a sequence diagram is as tall as the flow was
                busy - both were previously clipped by the shell, unreachable below the fold
                (measured: 20187px of page in a 670px panel). The list gives way first: half
                the page is the most it may hold, and the diagram keeps what it does not. */}
            <div
                data-testid="flow-executions"
                style={{flex: '0 1 auto', maxHeight: '50%', minHeight: 0, overflow: 'auto'}}
            >
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
                    <Column
                        field="kind"
                        header={useText('Kind')}
                    />
                    <Column
                        field="id"
                        header={useText('Execution')}
                        // Masked in captures: an execution id is minted per execution, so
                        // it can never be the same value twice. Masking hides a value and not
                        // its width, so the box is fixed: a ULID is as wide as its own digits
                        // allow, and without this every column after it moved with the value
                        // nobody can see.
                        body={(row: IFlowSummary) => (
                            <span
                                data-testid="flow-execution"
                                style={{display: 'inline-block', width: '18rem'}}
                            >
                                {row.id ?? ''}
                            </span>
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
            </div>
            {diagram !== undefined && (
                <div
                    data-testid="flow-diagram"
                    // The diagram scrolls *here*, inside the page: the box takes the height
                    // the table leaves and turns everything past it into a scrollbar, so a
                    // long sequence is readable end to end without the page itself growing
                    // past the panel.
                    style={{flex: '1 1 auto', minHeight: '8rem', overflow: 'auto'}}
                >
                    <DiagramViewer
                        diagram={diagram}
                        renderer={rendererName(config)}
                    />
                </div>
            )}
        </div>
    );
}
