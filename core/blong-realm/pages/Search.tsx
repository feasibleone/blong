import {Button} from 'primereact/button';
import {InputText} from 'primereact/inputtext';
import {useState} from 'react';
import {useText} from '@feasibleone/blong-browser';
import {useRealmCall} from './useRealmData.js';

/**
 * Ask the service what it knows about something.
 *
 * The query goes to the service rather than being filtered here: the service
 * holds the templates, their fingerprints and their embedding, and a search run
 * in the browser would have to fetch everything first and still be unable to
 * rank. The answer is shown as it came — the shape of a search result is the
 * service's business, and a viewer that reshaped it would be a second, quieter
 * definition of it.
 */
export function Search() {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState<{data?: unknown; error?: string}>({});
    const [busy, setBusy] = useState(false);
    const call = useRealmCall();

    const submit = async (): Promise<void> => {
        setBusy(true);
        setResult(await call('blong.search.find', {query}));
        setBusy(false);
    };

    return (
        <div className="flex flex-column gap-3">
            <div className="flex gap-2">
                <InputText
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={useText('What are you looking for?')}
                    className="flex-1"
                    onKeyDown={event => {
                        if (event.key === 'Enter') void submit();
                    }}
                />
                <Button label={useText('Search')} loading={busy} onClick={() => void submit()} />
            </div>
            {result.error !== undefined && <small className="text-red-500">{result.error}</small>}
            {result.data !== undefined && (
                <pre className="text-sm overflow-auto">
                    {JSON.stringify(result.data, null, 2)}
                </pre>
            )}
        </div>
    );
}
