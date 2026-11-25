/* eslint-disable @eslint-react/no-array-index-key -- the lists below are one render of a value that
   never reorders: a message's blocks, a table's cells, a line of code's tokens. A key derived from
   the item would be the same string at every position of a table row, which is a worse key than the
   position it replaces. */
/**
 * agentSessionPage.tsx — the portal's agent sessions page (`@@T-797` … `@@T-800`).
 *
 * One page with two views rather than two pages: a list of sessions, and the session that was clicked.
 * Both read the routes the realm already publishes — `agent.session.find` for the list, and
 * `agent.session.watch` for the transcript — so the page is a shell around calls that are tested on
 * their own (`@@T-792` `@@T-793`).
 *
 * The transcript is laid out as the conversation it is: a compact bar that says what the session is
 * and what it has cost, and a single column of events under it — reasoning, tool cards, notes and
 * answers. The numbers a header used to list are in that bar, at a status line's size, because the
 * events are what a person opened the page for.
 *
 * The heavy parts are imported per block, not at the top of the file: markdown is read by
 * `markdownProse`, code is coloured by `markdownCode`, and a diagram is drawn by
 * `@feasibleone/blong-browser`'s `DiagramViewer`, which loads mermaid itself on the first diagram. A
 * session that shows none of them never pays for them (`@@D-991`).
 */
import {DiagramViewer, useBlong} from '@feasibleone/blong-browser';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import './agentSession/agentSession.css';

import {markdownBlocksOf, markdownPending} from './agentSession/markdownBlocks.js';
import {highlightLines, languageLabel, type ICodeToken} from './agentSession/markdownCode.js';
import {proseBlocksOf, type InlineSpan, type ProseBlock} from './agentSession/markdownProse.js';
import {
    sessionHeaderMerge,
    sessionHeaderOf,
    sessionToolsOf,
} from './agentSession/sessionMetrics.js';
import {
    sessionSectionsOf,
    type ISessionEvent,
    type ISessionSection,
} from './agentSession/sessionSections.js';
import {sessionRowsOf, type SessionRow} from './agentSession/toolGrouping.js';

/** The handler proxy, typed for a two-argument call. */
type ICall = (params: object, meta: object) => Promise<unknown>;

/** One row of `agent.session.find`. */
interface ISessionRow {
    sessionId: string;
    ticketTitle?: string;
    ticketId?: string;
    status?: string;
    workerId?: string;
    personaId?: string;
    modelName?: string;
    turnCount?: number;
    lastActivityAt?: string;
    updatedAt?: string;
    metric?: {
        turnCount?: number;
        messageTokens?: number;
        toolCount?: number;
        /** The per-tool fold, as the column carries it: an object or the JSON it was stored as. */
        tools?: unknown;
        lastEventAt?: number | string | null;
    };
}

/** One frame of `agent.session.watch`. */
interface IFeedFrame {
    partition?: number;
    offset?: number;
    last?: string;
    size?: number;
    events?: ISessionEvent[];
    reachedStart?: boolean;
}

const STATUSES = ['', 'running', 'awaiting', 'suspended', 'done', 'failed'];

/**
 * What a section is, in the vocabulary a chat component speaks.
 *
 * CopilotKit's message view renders by `role` — `assistant`, `reasoning`, `activity` — and the page
 * carries the same words on each section so a later move to a ready component is a mapping rather
 * than a rewrite. `tool` is this realm's own role: a tool call is not a message, and the view groups
 * runs of them (`@@D-1009`).
 */
const ROLES: Record<ISessionSection['kind'], string> = {
    message: 'assistant',
    reasoning: 'reasoning',
    tool: 'tool',
    note: 'activity',
};

/** The icon a section's kind is drawn with. */
const ICONS: Record<ISessionSection['kind'], string> = {
    reasoning: 'pi pi-sparkles',
    message: 'pi pi-comment',
    tool: 'pi pi-wrench',
    note: 'pi pi-info-circle',
};

const since = (at: string | undefined): string => {
    if (!at) return '—';
    const then = Date.parse(at);
    if (!Number.isFinite(then)) return '—';
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h ago`;
    return `${Math.round(seconds / 86_400)}d ago`;
};

/**
 * One line of a section, for its collapsed header: what is inside, without opening it.
 *
 * A tool's arguments are JSON, and the JSON a person wants to read is the command inside it — the
 * braces are the shape of the record, not the thing the tool was asked to do. A note's title already
 * says what it is, so it summarises as nothing rather than as its own payload.
 */
const summaryOf = (section: ISessionSection): string => {
    if (section.kind === 'note') return '';
    if (section.kind === 'tool') {
        const args = section.args ?? '';
        const command = /"(?:command|cmd|path|query)"\s*:\s*"([^"]+)"/.exec(args)?.[1];
        if (command !== undefined) return command;
        return args.replace(/\s+/g, ' ').trim().slice(0, 160);
    }
    const source = section.result ?? section.text;
    const first = (source ?? '').split('\n').find(line => line.trim() !== '') ?? '';
    return first.trim().slice(0, 160);
};

/** One coloured line of code, as the tokens the highlighter produced for it. */
function CodeLine({tokens}: {tokens: ICodeToken[]}): React.ReactElement {
    return (
        <code>
            {tokens.map((token, index) => (
                <span
                    className={`tok-${token.kind}`}
                    key={index}
                >
                    {token.text}
                </span>
            ))}
        </code>
    );
}

/**
 * A block of code, with its language named where a reader can see it.
 *
 * The fence is highlighted in one call and then cut into lines, not highlighted a line at a time: a
 * comment or a template literal that spans lines is only a comment if the run that coloured it knew
 * the line before, and a page that coloured each line alone lost exactly that (`@@D-1011`). A
 * partial line still renders while the message streams, because the text it renders is the text that
 * arrived.
 */
function CodeBlock({language, text}: {language: string; text: string}): React.ReactElement {
    const label = languageLabel(language);
    const lines = useMemo(() => highlightLines(label, text), [label, text]);
    return (
        <pre
            className="agent-code"
            data-language={label}
        >
            {lines.map((tokens, index) => (
                <React.Fragment key={index}>
                    {index > 0 && '\n'}
                    <CodeLine tokens={tokens} />
                </React.Fragment>
            ))}
        </pre>
    );
}

/** One inline run: code, emphasis, a link whose target the page may follow. */
function Inline({spans}: {spans: InlineSpan[]}): React.ReactElement {
    return (
        <>
            {spans.map((span, index) => {
                if (span.kind === 'code')
                    return (
                        <code
                            className="agent-inline-code"
                            key={index}
                        >
                            {span.text}
                        </code>
                    );
                if (span.kind === 'strong') return <strong key={index}>{span.text}</strong>;
                if (span.kind === 'em') return <em key={index}>{span.text}</em>;
                if (span.kind === 'link')
                    return (
                        <a
                            href={span.href}
                            key={index}
                            rel="noreferrer noopener"
                            target="_blank"
                        >
                            {span.text}
                        </a>
                    );
                return <React.Fragment key={index}>{span.text}</React.Fragment>;
            })}
        </>
    );
}

function Prose({block}: {block: ProseBlock}): React.ReactElement {
    if (block.kind === 'heading') {
        const level = Math.min(6, Math.max(3, block.level + 2));
        const Heading = `h${level}` as keyof React.JSX.IntrinsicElements;
        return (
            <Heading>
                <Inline spans={block.spans} />
            </Heading>
        );
    }
    if (block.kind === 'list')
        return block.ordered ? (
            <ol>
                {block.items.map((item, index) => (
                    <li key={index}>
                        <Inline spans={item} />
                    </li>
                ))}
            </ol>
        ) : (
            <ul>
                {block.items.map((item, index) => (
                    <li key={index}>
                        <Inline spans={item} />
                    </li>
                ))}
            </ul>
        );
    if (block.kind === 'table')
        return (
            <table className="agent-table">
                <thead>
                    <tr>
                        {block.header.map((cell, index) => (
                            <th key={index}>
                                <Inline spans={cell} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {block.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                                <td key={cellIndex}>
                                    <Inline spans={cell} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    if (block.kind === 'quote')
        return (
            <blockquote>
                <Inline spans={block.spans} />
            </blockquote>
        );
    if (block.kind === 'rule') return <hr />;
    return (
        <p>
            <Inline spans={block.spans} />
        </p>
    );
}

/**
 * A message, with its fences read as what they are.
 *
 * A fence that has not closed yet is shown as its own text: the page receives a delta at a time, and
 * a diagram that is re-parsed on every partial line flickers between "invalid" and drawn (`@@T-799`).
 */
function Message({text}: {text: string}): React.ReactElement {
    const blocks = useMemo(() => markdownBlocksOf(text), [text]);
    const pending = useMemo(() => markdownPending(text), [text]);
    return (
        <div
            className="agent-message"
            data-pending={pending ? 'yes' : 'no'}
        >
            {blocks.map((block, index) => {
                if (block.kind === 'mermaid')
                    return (
                        <DiagramViewer
                            className="agent-diagram"
                            diagram={block.text}
                            key={index}
                        />
                    );
                if (block.kind === 'code')
                    return (
                        <CodeBlock
                            key={index}
                            language={block.language}
                            text={block.text}
                        />
                    );
                if (block.kind === 'pending')
                    return (
                        <CodeBlock
                            key={index}
                            language={block.language}
                            text={block.text}
                        />
                    );
                return (
                    <React.Fragment key={index}>
                        {proseBlocksOf(block.text).map((prose, proseIndex) => (
                            <Prose
                                block={prose}
                                key={proseIndex}
                            />
                        ))}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

/**
 * One event of the transcript.
 *
 * The header is the control: a caret that turns, the kind's icon, what the section is and — while it
 * is folded — the first line of what it holds, so a reader can decide whether to open it. A message
 * has no caret: it is the answer, and it is always shown.
 */
function Section({
    section,
    open,
    onToggle,
    latest,
}: {
    section: ISessionSection;
    open: boolean;
    onToggle: () => void;
    latest: boolean;
}): React.ReactElement {
    // A message is the answer and a note is the thing a person has to act on — a question, a state —
    // so both are always shown. A tool and a reasoning block are the working out, and their header is
    // the control that folds them.
    const foldable = section.kind !== 'message' && section.kind !== 'note';
    const shown = foldable ? open : true;
    const duration =
        section.kind === 'tool' && section.startedAt !== undefined && section.endedAt !== undefined
            ? section.endedAt - section.startedAt
            : undefined;
    const head =
        section.kind === 'message' ? (
            <div className="agent-section-head">
                <span className="agent-section-label">assistant</span>
            </div>
        ) : (
            <div className="agent-section-head">
                {foldable ? (
                    <i className={`agent-caret pi ${open ? 'pi-angle-down' : 'pi-angle-right'}`} />
                ) : (
                    <span className="agent-caret" />
                )}
                <i className={`agent-icon ${ICONS[section.kind]}`} />
                <span className="agent-section-title">{section.title ?? section.kind}</span>
                {!shown && summaryOf(section) !== '' && (
                    <span className="agent-section-summary">{summaryOf(section)}</span>
                )}
                {duration !== undefined && (
                    <span className="agent-section-time">{duration} ms</span>
                )}
            </div>
        );
    return (
        <section
            className={`agent-section agent-section-${section.kind}`}
            data-done={section.done ? 'yes' : 'no'}
            data-interrupt={section.kind === 'note' && section.title === 'awaiting' ? 'yes' : undefined}
            data-kind={section.kind}
            data-latest={latest ? 'yes' : 'no'}
            data-open={shown ? 'yes' : 'no'}
            data-role={ROLES[section.kind]}
            data-title={section.title}
        >
            {foldable ? (
                <button
                    className="agent-section-head"
                    onClick={onToggle}
                    type="button"
                >
                    <i className={`agent-caret pi ${open ? 'pi-angle-down' : 'pi-angle-right'}`} />
                    <i className={`agent-icon ${ICONS[section.kind]}`} />
                    <span className="agent-section-title">{section.title ?? section.kind}</span>
                    {!open && summaryOf(section) !== '' && (
                        <span className="agent-section-summary">{summaryOf(section)}</span>
                    )}
                    {duration !== undefined && (
                        <span className="agent-section-time">{duration} ms</span>
                    )}
                </button>
            ) : (
                head
            )}
            {shown && (
                <div className="agent-section-body">
                    {section.args !== undefined && (
                        <CodeBlock
                            language="json"
                            text={section.args}
                        />
                    )}
                    {section.text !== '' &&
                        (section.kind === 'message' ? (
                            <Message text={section.text} />
                        ) : (
                            <p className="agent-section-text">{section.text}</p>
                        ))}
                    {section.result !== undefined && (
                        <CodeBlock
                            language="text"
                            text={section.result}
                        />
                    )}
                </div>
            )}
        </section>
    );
}

/**
 * A run of tool calls, as one row (`@@D-1010`).
 *
 * The header says what the run did and how long it took; opening it shows a row per call, and a row
 * opens to the arguments it was made with and the output it answered with. That is the shape
 * CopilotKit's message view calls a grouped tool-call card, and the reason to have it is that a
 * turn's work is otherwise a wall of near-identical boxes.
 */
function ToolRun({
    run,
    open,
    onToggle,
    latest,
}: {
    run: Extract<SessionRow, {kind: 'tools'}>;
    open: boolean;
    onToggle: () => void;
    latest: boolean;
}): React.ReactElement {
    return (
        <section
            className='agent-section agent-tools'
            data-done={run.done ? 'yes' : 'no'}
            data-kind='tools'
            data-latest={latest ? 'yes' : 'no'}
            data-open={open ? 'yes' : 'no'}
            data-role='tool'
        >
            <button
                className='agent-section-head'
                onClick={onToggle}
                type='button'
            >
                <i className={`agent-caret pi ${open ? 'pi-angle-down' : 'pi-angle-right'}`} />
                <i className='agent-icon pi pi-wrench' />
                <span className='agent-section-title'>{run.title}</span>
                {!open && (
                    <span className='agent-section-summary'>
                        {run.calls.map(call => summaryOf(call)).filter(Boolean).join(' · ')}
                    </span>
                )}
                <span className='agent-section-time'>{run.durationMs} ms</span>
            </button>
            {open && (
                <div className='agent-section-body'>
                    {run.calls.map(call => (
                        <ToolCallRow
                            call={call}
                            key={call.key}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

/** One call inside a run: its name and command, then — opened — its arguments and result. */
function ToolCallRow({call}: {call: ISessionSection}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const duration =
        call.durationMs ??
        (call.startedAt !== undefined && call.endedAt !== undefined
            ? call.endedAt - call.startedAt
            : undefined);
    return (
        <div
            className='agent-tools-row'
            data-done={call.done ? 'yes' : 'no'}
            data-open={open ? 'yes' : 'no'}
        >
            <button
                className='agent-tools-row-head'
                onClick={() => setOpen(current => !current)}
                type='button'
            >
                <i className={`agent-caret pi ${open ? 'pi-angle-down' : 'pi-angle-right'}`} />
                <span className='agent-tools-row-name'>{call.title ?? 'tool'}</span>
                <span className='agent-tools-row-command'>{summaryOf(call)}</span>
                {duration !== undefined && (
                    <span className='agent-section-time'>{duration} ms</span>
                )}
            </button>
            {open && (
                <div className='agent-tools-row-body'>
                    {call.args !== undefined && (
                        <CodeBlock
                            language='json'
                            text={call.args}
                        />
                    )}
                    {call.result !== undefined && (
                        <CodeBlock
                            language='text'
                            text={call.result}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * The bar: what the session is, and what it has cost (`@@T-800`).
 *
 * One line, at a status bar's size: the title, the state, the host and the model, then the numbers.
 * They are the answer to "is this going well" while the transcript is what a person is reading, so
 * they stay out of its way rather than sitting above it at heading size.
 */
function StatusBar({row, events}: {row: ISessionRow | undefined; events: ISessionEvent[]}) {
    // The clock that makes a running tool's elapsed time move. One tick a second, and only while a
    // tool is out: a bar that re-rendered a settled session would be work nobody asked for.
    const [now, setNow] = useState(() => Date.now());
    const live = useMemo(() => sessionHeaderOf(events, {now}), [events, now]);
    const running = live.runningTool !== undefined;
    useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(timer);
    }, [running]);

    const metric = row?.metric;
    const header = sessionHeaderMerge(
        metric && {...metric, tools: sessionToolsOf(metric.tools)},
        live,
    );
    const cells = [
        {label: 'turns', value: String(header.turns)},
        {label: 'tokens', value: String(header.tokensOut)},
        {label: 'context', value: String(header.contextLength)},
        {label: 'tools', value: String(header.tools.reduce((sum, tool) => sum + tool.count, 0))},
        {label: 'tool time', value: `${header.toolTotalMs} ms`},
        ...(header.runningTool
            ? [
                  {
                      label: 'running',
                      value: `${header.runningTool.name} · ${header.runningTool.elapsedMs} ms`,
                  },
              ]
            : []),
    ];
    return (
        <div
            className="agent-statusbar"
            data-metrics={header.source}
        >
            <h2 className="agent-session-title">
                {row?.ticketTitle ?? row?.ticketId ?? 'Session'}
            </h2>
            <span
                className="agent-pill"
                data-status={row?.status}
            >
                {row?.status ?? 'unknown'}
            </span>
            {row?.workerId !== undefined && <span className="agent-pill">{row.workerId}</span>}
            {row?.modelName !== undefined && <span className="agent-pill">{row.modelName}</span>}
            <span className="agent-pill">{since(row?.lastActivityAt ?? row?.updatedAt)}</span>
            <dl className="agent-metrics">
                {cells.map(cell => (
                    <div
                        data-metric={cell.label}
                        key={cell.label}
                    >
                        <dt>{cell.label}</dt>
                        <dd>{cell.value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

/** The transcript of one session, streamed while it is open. */
function SessionView({row, onBack}: {row: ISessionRow; onBack: () => void}): React.ReactElement {
    const {handler} = useBlong();
    const call = handler as unknown as Record<string, ICall | undefined>;
    const sessionId = row.sessionId;
    const [events, setEvents] = useState<ISessionEvent[]>([]);
    const [stream, setStream] = useState<{open: boolean; end?: string}>({open: false});
    const [error, setError] = useState<string | undefined>(undefined);
    // What this reader has opened or closed, over what the reducer opened: a person who expands an
    // old card keeps it expanded while new events arrive, and the newest stays open until they say
    // otherwise.
    const [toggled, setToggled] = useState<Record<string, boolean>>({});
    // The cursor the stream resumes from: a reconnect asks for what it has not rendered, and the
    // server's own tail arithmetic decides what "the start" means (`@@T-793`).
    const cursorRef = useRef<string | undefined>(undefined);
    const sections = useMemo(() => sessionSectionsOf(events), [events]);
    // Grouped for display only: the sections stay the list the reducer produced, so what the page
    // shows and what a test reduces are the same thing seen two ways (`@@T-798`).
    const rows = useMemo(() => sessionRowsOf(sections), [sections]);

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        void (async () => {
            try {
                const frames = (await call['agent.session.watch']?.(
                    {sessionId, tail: 500},
                    {stream: 'binary', abort: controller.signal},
                )) as AsyncIterable<IFeedFrame> | undefined;
                if (!frames) {
                    setError('the session stream is not available in this build');
                    return;
                }
                setStream({open: true});
                for await (const frame of frames) {
                    if (cancelled) return;
                    cursorRef.current = frame.last;
                    if (!frame.events || frame.events.length === 0) continue;
                    setEvents(current => [...current, ...(frame.events ?? [])]);
                }
                setStream({open: false, end: 'ended'});
            } catch (problem) {
                if (cancelled) return;
                setStream({open: false, end: 'failed'});
                setError(String((problem as Error)?.message ?? problem).slice(0, 200));
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [call, sessionId]);

    return (
        <div
            className="agent-session-view"
            data-events={events.length}
            data-sections={sections.length}
            data-stream={stream.open ? 'open' : (stream.end ?? 'closed')}
        >
            <StatusBar
                events={events}
                row={row}
            />
            <div className="agent-transcript">
                <button
                    className="agent-back"
                    onClick={onBack}
                    type="button"
                >
                    ← sessions
                </button>
                {error !== undefined && (
                    <p
                        className="agent-error"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
                {rows.map((displayRow, index) => {
                    const latest = index === rows.length - 1;
                    if (displayRow.kind === "tools")
                        return (
                            <ToolRun
                                key={displayRow.key}
                                latest={latest}
                                onToggle={() =>
                                    setToggled(current => ({
                                        ...current,
                                        [displayRow.key]: !current[displayRow.key],
                                    }))
                                }
                                open={toggled[displayRow.key] ?? false}
                                run={displayRow}
                            />
                        );
                    return (
                        <Section
                            key={displayRow.key}
                            latest={latest}
                            onToggle={() =>
                                setToggled(current => ({
                                    ...current,
                                    [displayRow.key]: !(current[displayRow.key] ?? displayRow.section.open),
                                }))
                            }
                            open={toggled[displayRow.key] ?? displayRow.section.open}
                            section={displayRow.section}
                        />
                    );
                })}
                {/*
                 * The cursor, when the session is still working: a chat that stopped mid-turn looks
                 * exactly like a chat that finished unless something says otherwise. It is withheld
                 * when the last section is reasoning, which is itself the sign of work in progress —
                 * the rule CopilotKit's message view uses, and the reason it exists.
                 */}
                {row.status === "running" &&
                    sections[sections.length - 1]?.kind !== "reasoning" && (
                        <span
                            aria-label="working"
                            className="agent-cursor"
                            data-testid="agent-cursor"
                        />
                    )}
                {sections.length === 0 && stream.open && (
                    <p className="agent-session-footnote">waiting for the first event…</p>
                )}
            </div>
        </div>
    );
}

/** The list: what a person picks a session from (`@@T-797`). */
function SessionList({onOpen}: {onOpen: (row: ISessionRow) => void}): React.ReactElement {
    const {handler} = useBlong();
    const call = handler as unknown as Record<string, ICall | undefined>;
    const [rows, setRows] = useState<ISessionRow[]>([]);
    const [status, setStatus] = useState('');
    const [runningOnly, setRunningOnly] = useState(false);
    const [next, setNext] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);

    const load = useCallback(
        async (cursor?: string) => {
            setLoading(true);
            setError(undefined);
            try {
                const answer = (await call['agent.session.find']?.(
                    {
                        limit: 25,
                        ...(status === '' ? {} : {status}),
                        ...(runningOnly ? {status: 'running'} : {}),
                        ...(cursor ? {before: cursor} : {}),
                    },
                    {},
                )) as {sessions?: ISessionRow[]; next?: string} | undefined;
                const found = answer?.sessions ?? [];
                setRows(current => (cursor ? [...current, ...found] : found));
                setNext(answer?.next);
            } catch (problem) {
                setError(String((problem as Error)?.message ?? problem).slice(0, 200));
            } finally {
                setLoading(false);
            }
        },
        [call, status, runningOnly],
    );

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="agent-session-list">
            <div className="agent-session-filters">
                <label>
                    status{' '}
                    <select
                        onChange={event => setStatus(event.target.value)}
                        value={status}
                    >
                        {STATUSES.map(value => (
                            <option
                                key={value}
                                value={value}
                            >
                                {value === '' ? 'any' : value}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <input
                        checked={runningOnly}
                        onChange={event => setRunningOnly(event.target.checked)}
                        type="checkbox"
                    />{' '}
                    running only
                </label>
            </div>
            {error !== undefined && (
                <p
                    className="agent-error"
                    role="alert"
                >
                    {error}
                </p>
            )}
            {rows.length === 0 && !loading && (
                <p className="agent-empty">No sessions yet. A ticket that is claimed opens one.</p>
            )}
            {rows.length > 0 && (
                <table className="agent-table agent-session-table">
                    <thead>
                        <tr>
                            <th>title</th>
                            <th>status</th>
                            <th>worker</th>
                            <th>turns</th>
                            <th>tokens</th>
                            <th>activity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr
                                data-session={row.sessionId}
                                key={row.sessionId}
                                onClick={() => onOpen(row)}
                            >
                                <td>{row.ticketTitle ?? row.ticketId ?? row.sessionId}</td>
                                <td>{row.status ?? '—'}</td>
                                <td>{row.workerId ?? '—'}</td>
                                <td>{row.metric?.turnCount ?? row.turnCount ?? 0}</td>
                                <td>{row.metric?.messageTokens ?? 0}</td>
                                <td>{since(row.lastActivityAt ?? row.updatedAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {next !== undefined && (
                <button
                    className="agent-more"
                    onClick={() => void load(next)}
                    type="button"
                >
                    more
                </button>
            )}
        </div>
    );
}

/** The page: the list, or the session that was picked. */
export function AgentSessionPage(): React.ReactElement {
    // The row travels with the id: it is what the bar draws before a single event arrives, and a
    // second call to learn what the clicked row already said would be a round trip for nothing.
    const [opened, setOpened] = useState<ISessionRow | undefined>(undefined);
    return (
        <div
            className="agent-session-page"
            data-view={opened === undefined ? 'list' : 'session'}
        >
            {opened === undefined ? (
                <SessionList onOpen={setOpened} />
            ) : (
                <SessionView
                    onBack={() => setOpened(undefined)}
                    row={opened}
                />
            )}
        </div>
    );
}
