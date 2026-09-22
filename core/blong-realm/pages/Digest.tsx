import {useText} from '@feasibleone/blong-browser';
import {Button} from 'primereact/button';
import {Column} from 'primereact/column';
import {DataTable} from 'primereact/datatable';
import {InputText} from 'primereact/inputtext';
import {useState} from 'react';
import {useRealmRead} from './useRealmData.js';

/**
 * What the service learned recently — the change stream, read rather than
 * subscribed to.
 *
 * A read means this page can be opened, refreshed and left without holding a
 * connection: the stream is a list the service keeps, not a socket it expects
 * someone to be listening on. What an entry contains depends on what changed, so
 * the columns describe the fields a reader follows (when, what kind, which
 * template) and everything else stays in the record the service sent.
 */

interface IDigestEntry {
    seq?: number;
    /** When the change was recorded, in epoch milliseconds. */
    at?: number;
    kind?: string;
    /** The change's payload: the same fields flat on a record, nested under `data` here. */
    data?: {ref?: string; service?: string; signature?: string};
    service?: string;
    template?: string;
    fingerprint?: string;
}

export function Digest() {
    const digest = useRealmRead<{entries?: IDigestEntry[]} | IDigestEntry[]>('blong.digest.get', {
        limit: 100,
    });
    const entries = Array.isArray(digest.data) ? digest.data : (digest.data?.entries ?? []);
    const [filter, setFilter] = useState('');
    return (
        <div className="flex flex-column gap-3">
            <div className="flex justify-content-between gap-2">
                {/* The change stream grows with every run, so the kind is what lets
                    a reader (or a screenshot spec) pin the changes they mean to
                    follow instead of whatever the run happened to produce. */}
                <InputText
                    data-testid="browse-search"
                    value={filter}
                    onChange={event => setFilter(event.target.value)}
                    placeholder={useText('Filter')}
                />
                <Button
                    icon="pi pi-refresh"
                    text
                    label={useText('Refresh')}
                    onClick={digest.reload}
                />
            </div>
            {digest.error !== undefined && <small className="text-red-500">{digest.error}</small>}
            <DataTable
                value={entries}
                loading={digest.loading}
                globalFilter={filter}
                globalFilterFields={['kind']}
                emptyMessage={useText('Nothing changed yet')}
            >
                <Column
                    header={useText('When')}
                    body={(row: IDigestEntry) =>
                        // The service names the timestamp `at`; `time` is what a raw
                        // log record calls it. Reading the wrong one left this column
                        // empty while every other column worked, which looks like a
                        // page with no data rather than a page reading a field that
                        // is not there. Masked in captures: a wall clock cannot be
                        // pinned.
                        row.at === undefined ? (
                            ''
                        ) : (
                            <span
                                data-testid="digest-when"
                                // A fixed box, because this cell is masked in captures: masking
                                // hides a value's pixels and nothing else, and an ISO timestamp is
                                // as wide as its digits happen to be — so every column after this
                                // one started a pixel or two further along on each run, and the
                                // capture of this page failed on a value nobody could see. The box
                                // is what makes the mask a mask.
                                style={{display: 'inline-block', width: '14rem'}}
                            >
                                {new Date(row.at).toISOString()}
                            </span>
                        )
                    }
                />
                <Column
                    field="kind"
                    header={useText('Change')}
                />
                <Column
                    header={useText('Service')}
                    body={(row: IDigestEntry) => row.data?.service ?? row.service ?? ''}
                />
                <Column
                    header={useText('Message')}
                    body={(row: IDigestEntry) => row.data?.signature ?? row.template ?? ''}
                />
            </DataTable>
        </div>
    );
}
