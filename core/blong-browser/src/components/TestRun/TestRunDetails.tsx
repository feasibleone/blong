/**
 * The details panel, rendered below the cards. It is a plain toggle: changing the selected step
 * updates its content but does not close it, and there is no backdrop to click.
 */
import {useMemo, useState} from 'react';
import type {
    ITestLogRowModel,
    ITestProgressTreeNode,
    ITestRunModel,
    ITestSourceLinkConfig,
    ITestSourcePointer,
} from '../../types/testRun.js';
import {Text} from '../Text/Text.js';
import {
    assertionLabel,
    defaultSourceLinkConfig,
    formatDuration,
    logRows,
    progressTree,
    sourceHref,
    sourceLabel,
} from './testRunModel.js';

export interface ITestRunDetailsProps {
    run: ITestRunModel;
    stepName?: string;
    open: boolean;
    /** Base and scheme for source links; the pointer is always shown, linked or not. */
    sourceLink?: ITestSourceLinkConfig;
    onClose(): void;
}

type DetailsTab = 'progress' | 'result' | 'error' | 'log';

const TABS: Array<{id: DetailsTab; label: string}> = [
    {id: 'progress', label: 'Progress'},
    {id: 'result', label: 'Result'},
    {id: 'error', label: 'Error'},
    {id: 'log', label: 'Log'},
];

function safeStringify(value: unknown): string {
    if (value === undefined) return '';
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

/** A captured source pointer, linked when a base is configured and plain otherwise. */
function SourceLink({
    source,
    config,
}: {
    source?: ITestSourcePointer;
    config?: ITestSourceLinkConfig;
}) {
    if (!source?.file) return null;
    const href = sourceHref(source, config);
    const label = sourceLabel(source);
    const title = `${source.file}${source.line === undefined ? '' : `:${source.line}`}${
        source.symbol ? ` · ${source.symbol}` : ''
    }`;
    return href ? (
        <a
            className="blong-test-run__source"
            href={href}
            title={title}
            target="_blank"
            rel="noreferrer"
        >
            {label}
        </a>
    ) : (
        <span
            className="blong-test-run__source"
            title={title}
        >
            {label}
        </span>
    );
}

/** The Log tab: executor lines and assertion messages in one stream. */
function LogList({
    rows,
    startedAt,
    sourceLink,
}: {
    rows: ITestLogRowModel[];
    startedAt: number;
    sourceLink?: ITestSourceLinkConfig;
}) {
    if (!rows.length) {
        return (
            <p className="blong-test-run__muted">
                <Text>No log entries or assertions</Text>
            </p>
        );
    }
    return (
        <ul className="blong-test-run__logs">
            {rows.map((row, index) => (
                <li
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    key={`${row.kind}-${row.timestamp}-${index}-${row.stepName ?? ''}`}
                    className={`blong-test-run__log blong-test-run__log--${row.level}`}
                >
                    <span className="blong-test-run__log-time">
                        {formatDuration(Math.max(0, row.timestamp - startedAt))}
                    </span>
                    <span className="blong-test-run__log-level">
                        {row.kind === 'assertion'
                            ? row.passed
                                ? '✓ assert'
                                : '✗ assert'
                            : row.level}
                    </span>
                    <span className="blong-test-run__log-message">
                        {row.stepName && (
                            <span className="blong-test-run__log-step">{row.stepName}</span>
                        )}
                        {row.message}
                        <SourceLink
                            source={row.source}
                            config={sourceLink}
                        />
                    </span>
                </li>
            ))}
        </ul>
    );
}

function ProgressNodes({nodes, depth = 0}: {nodes: ITestProgressTreeNode[]; depth?: number}) {
    return (
        <ul className={`blong-test-run__progress-tree depth-${depth}`}>
            {nodes.map((node, index) => (
                <li
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    key={`${depth}-${index}-${node.name}`}
                    className={`blong-test-run__progress-node blong-test-run__progress-node--${node.kind}`}
                >
                    <span className="blong-test-run__progress-label">{node.name}</span>
                    {node.data && (
                        <span className="blong-test-run__progress-data">
                            {Object.entries(node.data)
                                .slice(0, 4)
                                .map(
                                    ([key, value]) =>
                                        `${key}=${safeStringify(value).replace(/\n/g, ' ')}`,
                                )
                                .join(' · ')}
                        </span>
                    )}
                    {node.children.length > 0 && (
                        <ProgressNodes
                            nodes={node.children}
                            depth={depth + 1}
                        />
                    )}
                </li>
            ))}
        </ul>
    );
}

function TestRunDetailsContent({run, stepName, open, sourceLink, onClose}: ITestRunDetailsProps) {
    const step = stepName ? run.steps[stepName] : undefined;
    const link = useMemo(() => sourceLink ?? defaultSourceLinkConfig(), [sourceLink]);
    // The exported wrapper keys this component by the selected step, so a different step starts on
    // the Log tab while a live refresh of the same step keeps the tab the user chose.
    const [tab, setTab] = useState<DetailsTab>('log');

    const tree = useMemo(() => progressTree(step?.progress), [step?.progress]);
    const rows = useMemo(() => logRows(run, stepName), [run, stepName]);

    if (!open) return null;

    const selectStep = (
        <p className="blong-test-run__muted">
            <Text>Select a step to see its details</Text>
        </p>
    );

    return (
        <section
            className="blong-test-run__details p-card p-component"
            aria-label="Step details"
        >
            <header className="blong-test-run__details-header">
                <div className="blong-test-run__details-title">
                    {step ? (
                        <>
                            <i
                                className={`blong-test-run__status pi ${
                                    step.status === 'failed'
                                        ? 'pi-times'
                                        : step.status === 'running'
                                          ? 'pi-spin pi-spinner'
                                          : step.status === 'completed'
                                            ? 'pi-check'
                                            : 'pi-circle-fill'
                                }`}
                            />
                            <span>{step.displayName}</span>
                            <span className="blong-test-run__details-meta">
                                {formatDuration(step.duration)} · assertions{' '}
                                {assertionLabel(step.assertions)}
                            </span>
                            <SourceLink
                                source={step.sourceLocation}
                                config={link}
                            />
                        </>
                    ) : (
                        <Text>Run log</Text>
                    )}
                </div>
                <button
                    type="button"
                    className="blong-test-run__graph-button"
                    aria-label="Close details"
                    onClick={onClose}
                >
                    <i className="pi pi-times" />
                </button>
            </header>
            <nav
                className="blong-test-run__tabs"
                role="tablist"
            >
                {TABS.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.id}
                        className={`blong-test-run__tab${tab === item.id ? ' is-active' : ''}`}
                        onClick={() => setTab(item.id)}
                    >
                        <Text>{item.label}</Text>
                        {item.id === 'error' && step?.error && (
                            <span className="blong-test-run__tab-badge">1</span>
                        )}
                        {item.id === 'log' && rows.length > 0 && (
                            <span className="blong-test-run__tab-badge">{rows.length}</span>
                        )}
                    </button>
                ))}
            </nav>
            <div className="blong-test-run__details-body">
                {tab === 'log' && (
                    <LogList
                        rows={rows}
                        startedAt={run.startedAt}
                        sourceLink={link}
                    />
                )}
                {tab === 'progress' &&
                    (!step ? (
                        selectStep
                    ) : tree.length ? (
                        <ProgressNodes nodes={tree} />
                    ) : (
                        <p className="blong-test-run__muted">
                            <Text>This step announced no checkpoints</Text>
                        </p>
                    ))}
                {tab === 'result' &&
                    (!step ? (
                        selectStep
                    ) : step.result === undefined ? (
                        <p className="blong-test-run__muted">
                            <Text>The step returned nothing</Text>
                        </p>
                    ) : (
                        <pre className="blong-test-run__code">{safeStringify(step.result)}</pre>
                    ))}
                {tab === 'error' &&
                    (!step ? (
                        selectStep
                    ) : step.error ? (
                        <div className="blong-test-run__error">
                            <div className="blong-test-run__error-message">
                                {step.error.message}
                            </div>
                            {step.error.type && (
                                <div className="blong-test-run__error-type">{step.error.type}</div>
                            )}
                            {step.error.stack && (
                                <pre className="blong-test-run__code">{step.error.stack}</pre>
                            )}
                            {step.error.context && (
                                <pre className="blong-test-run__code">
                                    {safeStringify(step.error.context)}
                                </pre>
                            )}
                        </div>
                    ) : (
                        <p className="blong-test-run__muted">
                            <Text>The step did not fail</Text>
                        </p>
                    ))}
            </div>
        </section>
    );
}

/**
 * The panel is keyed by the selected step: a different step starts on the Log tab, while a live
 * refresh of the same step keeps the tab the user chose.
 */
export function TestRunDetails(props: ITestRunDetailsProps) {
    return (
        <TestRunDetailsContent
            key={props.stepName ?? 'none'}
            {...props}
        />
    );
}
