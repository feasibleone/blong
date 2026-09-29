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
    /** The change's own text (`data.signature ?? template`), resolved for the table. */
    message?: string;
}

export function Digest() {
    const digest = useRealmRead<{entries?: IDigestEntry[]} | IDigestEntry[]>('blong.digest.get', {
        limit: 100,
    });
    const entries = Array.isArray(digest.data) ? digest.data : (digest.data?.entries ?? []);
    const [filter, setFilter] = useState('');
    // The service sends a change's fields flat on some records and nested under `data`
    // on others, so the two the table shows are resolved once, here. A column and the
    // filter have to agree on what a cell holds — a search that reads another field
    // than the cell renders matches text nobody can see.
    const rows = entries.map(entry => ({
        ...entry,
        service: entry.data?.service ?? entry.service ?? '',
        message: entry.data?.signature ?? entry.template ?? '',
    }));
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
                value={rows}
                loading={digest.loading}
                globalFilter={filter}
                // Every column the table shows is filterable, because the kind alone
                // cannot separate two changes of one kind: a reader who means the second
                // newest change of a kind has no way to ask for it, and a capture that
                // asks for "the newest of this kind" is a capture of whatever the run
                // happened to observe last (a slow start logs a line an ordinary one
                // does not).
                globalFilterFields={['kind', 'service', 'message']}
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
                    field="service"
                    header={useText('Service')}
                />
                <Column
                    field="message"
                    header={useText('Message')}
                />
            </DataTable>
        </div>
    );
}
