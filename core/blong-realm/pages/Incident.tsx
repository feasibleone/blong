import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {InputText} from 'primereact/inputtext';
import {Tag} from 'primereact/tag';
import {useState} from 'react';
import {useText} from '@feasibleone/blong-browser';
import {useRealmRead} from './useRealmData.js';

/**
 * What broke, where it started, and who else saw it.
 *
 * One incident is one trace and one burst: the anomalies several services
 * reported for the same request, merged and given a candidate origin. This is
 * the page that answers a question no single service's records can — which is
 * the whole reason the records are assembled centrally in the first place.
 */

interface IIncident {
    incidentId?: string;
    trace?: string;
    rootCause?: string;
    services?: string[];
    kinds?: string[];
    severity?: string;
    firstAt?: number;
    lastAt?: number;
}

/** Severity is a word, so it is shown as one — and coloured, since that is how it is read. */
function severityTag(row: IIncident) {
    return row.severity === undefined ? null : <Tag value={row.severity} />;
}

export function Incident() {
    const incidents = useRealmRead<IIncident[]>('blong.incident.find');
    const [filter, setFilter] = useState('');
    return (
        <div className="flex flex-column gap-3">
            {incidents.error !== undefined && (
                <small className="text-red-500">{incidents.error}</small>
            )}
            <InputText
                data-testid="browse-search"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder={useText('Filter')}
            />
            <DataTable
                value={Array.isArray(incidents.data) ? incidents.data : []}
                loading={incidents.loading}
                globalFilter={filter}
                globalFilterFields={['severity', 'rootCause', 'trace']}
                emptyMessage={useText('Nothing has gone wrong')}
                dataKey="incidentId"
            >
                <Column field="severity" header={useText('Severity')} body={severityTag} />
                <Column field="rootCause" header={useText('Where it started')} />
                <Column
                    header={useText('Services')}
                    body={(row: IIncident) => (row.services ?? []).join(', ')}
                />
                <Column header={useText('Kinds')} body={(row: IIncident) => (row.kinds ?? []).join(', ')} />
                <Column field="trace" header={useText('Trace')} />
                <Column
                    header={useText('First seen')}
                    body={(row: IIncident) =>
                        row.firstAt === undefined ? '' : new Date(row.firstAt).toISOString()
                    }
                />
            </DataTable>
        </div>
    );
}
