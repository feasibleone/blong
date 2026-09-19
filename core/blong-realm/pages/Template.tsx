import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {InputText} from 'primereact/inputtext';
import {useState} from 'react';
import {useText} from '@feasibleone/blong-browser';
import {useRealmRead} from './useRealmData.js';

/**
 * The messages the service has learned, with the variables taken out.
 *
 * A template is what many records collapse into — the same line with its
 * variable parts removed, kept under a fingerprint — so this is the closest
 * thing the service has to a list of "what this system actually says".
 *
 * The field names are the service's own (`signature`, `service`), not the ones a
 * page might guess (`template`, `services`): reading the wrong name leaves a
 * column empty while every other column works, which reads as "no data" rather
 * than "wrong field".
 */

interface ITemplate {
    ref?: string;
    fingerprint?: string;
    /** The message with its variables removed, level and service included. */
    signature?: string;
    /** The service that produced it. */
    service?: string;
    count?: number;
    levelName?: string;
}

export function Template() {
    const templates = useRealmRead<ITemplate[]>('blong.template.find');
    const [filter, setFilter] = useState('');
    return (
        <div className="flex flex-column gap-3">
            {templates.error !== undefined && (
                <small className="text-red-500">{templates.error}</small>
            )}
            {/* The filter is what lets a page (and a screenshot spec) pin the row
                it means to show: the service keeps learning, so an unfiltered
                capture drifts with whatever the run happened to observe. */}
            <InputText
                data-testid="browse-search"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder={useText('Filter')}
            />
            <DataTable
                value={Array.isArray(templates.data) ? templates.data : []}
                loading={templates.loading}
                globalFilter={filter}
                globalFilterFields={['signature', 'service', 'levelName']}
                emptyMessage={useText('Nothing learned yet')}
            >
                <Column field="levelName" header={useText('Level')} />
                <Column field="signature" header={useText('Message')} />
                <Column field="count" header={useText('Seen')} />
                <Column field="fingerprint" header={useText('Fingerprint')} />
                <Column field="service" header={useText('Service')} />
            </DataTable>
        </div>
    );
}
