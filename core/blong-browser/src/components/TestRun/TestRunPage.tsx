/**
 * TestRunPage — the picker around the console.
 *
 * The host supplies a catalog and a loader; the page never lets the user name an arbitrary method,
 * so only a scenario the host listed can be run. The loader is the host's registry lookup; it is
 * called with a catalog method, never with a free-form string.
 */
import type {IMeta, StepArray} from '@feasibleone/blong-chain/browser.ts';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Dropdown} from '../../primereact/index.js';
import type {ITestRunEvent, ITestRunModel, ITestSourceLinkConfig} from '../../types/testRun.js';
import {Button} from '../Button/Button.js';
import {Text} from '../Text/Text.js';
import {BrowserTestRunSource, pendingBrowserRun} from './browserTestRunSource.js';
import {PollingTestRunSource, type ITestRunServerTransport} from './pollingTestRunSource.js';
import {TestRun} from './TestRun.js';
import './TestRunPage.css';

export interface ITestRunCatalogEntry {
    /** Wire name of the test group, e.g. `test.session.flow`. */
    method: string;
    /** Display name shown in the picker. */
    name: string;
    /** Where the steps run; browser by default. */
    host?: 'browser' | 'server';
    /** Groups the scenario covers, when the host knows them. */
    groups?: string[];
    description?: string;
}

export interface ITestRunPageProps {
    /** The scenarios the page may run. Nothing outside this list is ever loaded. */
    catalog: ITestRunCatalogEntry[];
    /** Resolve a browser catalog method to its step array (the host's registry lookup). */
    load?(method: string): StepArray | Promise<StepArray>;
    /** The transport for server-hosted entries; required when the catalog names one. */
    transport?: ITestRunServerTransport;
    /** Forwarded to the run; usually the logged-in user's meta. */
    $meta?: IMeta;
    /** Base and scheme for source links in the console. */
    sourceLink?: ITestSourceLinkConfig;
    title?: string;
    defaultDetailsOpen?: boolean;
    /** Write the final model and event stream into hidden nodes for a Playwright capture. */
    capture?: boolean;
    className?: string;
}

/** JSON for a capture, falling back to a marker rather than throwing on a circular result. */
function captureJson(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify({truncated: true});
    }
}

const entryKey = (entry: ITestRunCatalogEntry): string =>
    `${entry.host ?? 'browser'}:${entry.method}`;

export function TestRunPage({
    catalog,
    load,
    transport,
    $meta,
    sourceLink,
    title = 'Test run',
    defaultDetailsOpen,
    capture = false,
    className,
}: ITestRunPageProps) {
    const [method, setMethod] = useState<string | undefined>(() =>
        catalog[0] ? entryKey(catalog[0]) : undefined,
    );
    const [run, setRun] = useState<ITestRunModel | undefined>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const sourceRef = useRef<BrowserTestRunSource | PollingTestRunSource | undefined>(undefined);
    const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
    const eventsRef = useRef<ITestRunEvent[]>([]);

    const options = useMemo(
        () =>
            catalog.map(entry => ({
                label: entry.name,
                value: entryKey(entry),
            })),
        [catalog],
    );

    const selectedMethod =
        method && catalog.some(entry => entryKey(entry) === method)
            ? method
            : catalog[0]
              ? entryKey(catalog[0])
              : undefined;

    useEffect(
        () => () => {
            unsubscribeRef.current?.();
            const source = sourceRef.current;
            if (source instanceof PollingTestRunSource) void source.cancel();
            else void source?.stop();
        },
        [],
    );

    const stop = (): void => {
        unsubscribeRef.current?.();
        unsubscribeRef.current = undefined;
        const source = sourceRef.current;
        if (source instanceof PollingTestRunSource) void source.cancel();
        else void source?.stop();
        sourceRef.current = undefined;
        setBusy(false);
    };

    const start = async (): Promise<void> => {
        const entry = catalog.find(item => entryKey(item) === selectedMethod);
        if (!entry) {
            setError('Select a scenario from the catalog');
            return;
        }
        stop();
        setError(undefined);
        setBusy(true);
        try {
            let source: BrowserTestRunSource | PollingTestRunSource;
            let initialRun: ITestRunModel | undefined;
            if (entry.host === 'server') {
                if (!transport) throw new Error('No server transport is configured');
                source = new PollingTestRunSource({
                    transport,
                    method: entry.method,
                    $meta,
                });
                initialRun = {
                    ...pendingBrowserRun({
                        name: entry.name,
                        method: entry.method,
                        steps: [],
                        $meta,
                    }),
                    host: 'server',
                };
            } else {
                if (!load) throw new Error('No browser loader is configured');
                const steps = await load(entry.method);
                if (!Array.isArray(steps)) {
                    throw new Error(`"${entry.method}" did not return a step array`);
                }
                source = new BrowserTestRunSource({
                    name: entry.name,
                    method: entry.method,
                    steps,
                    $meta,
                });
            }
            sourceRef.current = source;
            eventsRef.current = [];
            setRun(initialRun ?? source.snapshot());
            unsubscribeRef.current = source.subscribe(event => {
                eventsRef.current.push(event);
                setRun(source.snapshot());
            });
            void source.start().finally(() => setBusy(false));
        } catch (reason) {
            setError((reason as Error)?.message ?? String(reason));
            setBusy(false);
        }
    };

    return (
        <div className={['blong-test-run-page', className ?? ''].filter(Boolean).join(' ')}>
            <header className="blong-test-run-page__bar">
                <span className="blong-test-run-page__title">
                    <Text>{title}</Text>
                </span>
                <Dropdown
                    value={selectedMethod}
                    options={options}
                    onChange={event => setMethod((event.value as string | null) ?? undefined)}
                    placeholder="Select a scenario"
                    aria-label="Scenario"
                    className="blong-test-run-page__picker"
                    disabled={busy}
                />
                <Button
                    type="button"
                    size="small"
                    icon="pi pi-play"
                    label={run ? 'Run again' : 'Run'}
                    disabled={!selectedMethod || busy}
                    onClick={() => void start()}
                />
                {busy && (
                    <Button
                        type="button"
                        size="small"
                        text
                        icon="pi pi-stop"
                        label="Stop"
                        onClick={stop}
                    />
                )}
                {error && (
                    <span
                        className="blong-test-run-page__error"
                        role="alert"
                    >
                        {error}
                    </span>
                )}
            </header>
            <div className="blong-test-run-page__console">
                {run ? (
                    <TestRun
                        run={run}
                        sourceLink={sourceLink}
                        defaultDetailsOpen={defaultDetailsOpen}
                    />
                ) : (
                    <div className="blong-test-run-page__empty">
                        <Text>Select a scenario and run it</Text>
                    </div>
                )}
            </div>
            {capture && run && (
                <pre
                    className="blong-test-run-page__model"
                    data-testid="test-run-model"
                    hidden
                >
                    {captureJson(run)}
                </pre>
            )}
            {capture && run && (
                <pre
                    className="blong-test-run-page__model"
                    data-testid="test-run-events"
                    hidden
                >
                    {captureJson(eventsRef.current)}
                </pre>
            )}
        </div>
    );
}
