/**
 * React client for the blong-log real-time log viewer.
 *
 * Uses the SVAR React Grid component for efficient rendering of log entries.
 * Connects to the log server via WebSocket for real-time updates and REST API
 * for initial data loading.
 */

import React, {
    type CSSProperties,
    createContext,
    use,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {Grid, Willow, WillowDark} from '@svar-ui/react-grid';

import {
    bytesOfHex,
    captureOf,
    contextOf,
    decisionOf,
    exchangeOf,
    flowOf,
    intentOf,
    messageIdOf,
    operationOf,
    paramsOf,
    parentOf,
    serviceOf,
    signalOf,
    traceOf,
} from '../record.ts';
import type {ClientConfig, FilterOptions, LogEntry, ThemeConfig, WsMessage} from '../types.ts';
import {LEVEL_NAME} from '../types.ts';
import {CapturePanel} from './CapturePanel.tsx';
import {highlightSearch, SyntaxHighlight} from './Highlight.tsx';
import {DecisionPanel, ExchangePanel, RecordContextStrip} from './RecordPanels.tsx';

// ── Viewer Context ────────────────────────────────────────────────────────────

/**
 * Which part of a row is expanded.
 *
 * The message and the JSON are expanded separately: a reader looking at what a line *said* does not
 * want a record's whole JSON under it, and one reading the JSON is not helped by the sentence above it
 * taking the room the structure needs.
 */
type ExpandedPart = 'message' | 'json';

/** The rows expanded in each part of the table. */
interface IExpandedRows {
    message: Set<string>;
    json: Set<string>;
}

interface ViewerContextValue {
    theme: ThemeConfig;
    searchText: string;
    clientConfig: ClientConfig | null;
    onTraceFilter: (traceId: string) => void;
    onToggleExpanded: (rowId: string, part: ExpandedPart) => void;
    /** Ask the table for everything matching `text` — what a context chip does when it is clicked. */
    onFilterText: (text: string) => void;
}

const ViewerContext = createContext<ViewerContextValue>({
    theme: {},
    searchText: '',
    clientConfig: null,
    onTraceFilter: () => {},
    onToggleExpanded: () => {},
    onFilterText: () => {},
});

const ExpandedRowsContext = createContext<IExpandedRows | null>(null);

/**
 * The viewport an expanded record's detail scrolls in, and the height its row is drawn at.
 *
 * Both are derived from the record — never measured. A row that is measured is drawn at its collapsed
 * height first and jumps when the measurement lands, so scrolling an expanded row out of view and back
 * re-draws it collapsed for a frame: a flicker, a scroller that repositions itself, and sometimes a
 * scroll that stops responding because the row under the pointer changed size (`@@F-774`).
 *
 * Deriving it rather than fixing it is what keeps a row with nothing to show from being as tall as a
 * frame dump: the estimate is the content's own shape — bytes for a frame, lines for a document, the
 * sentence for a plain message — and the detail scrolls past the cap.
 */
const DETAIL_MAX = 520;
/** What the cell adds around the scroll container: its own padding. */
const CELL_CHROME = 16;
/** The smallest detail worth drawing: the shape badge and one line under it. */
const DETAIL_MIN = 68;

const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), high);

/** The lines a block of monospace text needs at the viewer's 15px line height. */
const monospaceLines = (text: string, columns = 90): number =>
    Math.ceil(text.length / columns) + (text.match(/\n/g)?.length ?? 0);

/** The lines a payload occupies once it is drawn: pretty-printed when it is a document. */
function payloadLines(payload: string): number {
    try {
        return JSON.stringify(JSON.parse(payload), null, 2).split('\n').length;
    } catch {
        return monospaceLines(payload);
    }
}

/**
 * The height the detail of an expanded row needs, in pixels, before it starts to scroll.
 *
 * Estimated from what will be drawn, from the record alone — never by measuring: a frame is 14px a row
 * plus its header and the facts above it, a document is 15px a pretty-printed line, a capture that kept
 * no payload is a single line, and a plain message is its sentence plus whatever block the record
 * carried beside it. The numbers were calibrated against the rendered stories, so a row is neither a
 * band of empty space nor a box that clips the thing it was opened to show (`@@F-774`).
 */
function detailHeightOf(row: LogEntry, part: ExpandedPart): number {
    if (part === 'json') {
        return clamp(
            JSON.stringify(row, null, 2).split('\n').length * 15 + 20,
            DETAIL_MIN,
            DETAIL_MAX,
        );
    }
    const capture = captureOf(row);
    if (capture !== undefined) {
        const headers = capture.fields['headers'];
        const headerRows =
            headers !== null && typeof headers === 'object' ? Object.keys(headers).length : 0;
        // An exchange draws its own line for the URL and the phase, above whatever body it kept.
        const requestLine = capture.fields['url'] === undefined ? 0 : 20;
        if (capture.shape === 'tcp.frame' && capture.payload !== undefined) {
            const bytes = bytesOfHex(capture.payload)?.length ?? 0;
            return clamp(Math.ceil(bytes / 16) * 14 + 82 + headerRows * 15, DETAIL_MIN, DETAIL_MAX);
        }
        if (capture.payload !== undefined) {
            return clamp(
                payloadLines(capture.payload) * 15 + 70 + requestLine + headerRows * 15,
                DETAIL_MIN,
                DETAIL_MAX,
            );
        }
        // The rung kept nothing: the shape badge, the facts and the notice are all there is to draw.
        return clamp(DETAIL_MIN + requestLine + headerRows * 15, DETAIL_MIN, DETAIL_MAX);
    }
    // The panels under the message: the chips that name the branch, the call, the intent and the cause;
    // the exchange; the decision; the error box; and the signal's own values — each in the lines it
    // draws plus its padding and the gap above it.
    const params = paramsOf(row);
    const chips =
        intentOf(row) === undefined &&
        flowOf(row) === undefined &&
        parentOf(row) === undefined &&
        decisionOf(row) === undefined
            ? 0
            : 24;
    const exchange = exchangeOf(row);
    // Each side of an exchange is a padded block with a title, its headers, and — when it kept one — a
    // labelled body drawn pretty-printed. The body is counted in the lines it *renders* as, not the
    // characters it was sent as: a compact JSON document is ten lines once it is indented, and an
    // estimate that counted the compact form left the last three of them under the fold.
    const side = (headers: Record<string, string> | undefined, body: unknown): number =>
        headers === undefined && body === undefined
            ? 0
            : 40 +
              (headers === undefined ? 0 : Object.keys(headers).length * 16) +
              (body === undefined
                  ? 0
                  : 24 +
                    payloadLines(typeof body === 'string' ? body : JSON.stringify(body, null, 2)) *
                        15);
    const exchangeH =
        exchange === undefined
            ? 0
            : side(exchange.requestHeaders, exchange.requestBody) +
              side(exchange.responseHeaders, exchange.responseBody) +
              (exchange.request === undefined ? 0 : 20);
    const decision = decisionOf(row);
    const decisionH =
        decision === undefined
            ? 0
            : 30 +
              decision.candidates.length * 15 +
              (decision.values === undefined
                  ? 15
                  : monospaceLines(JSON.stringify(decision.values, null, 2)) * 15);
    const blocks =
        chips +
        exchangeH +
        decisionH +
        (row.err ? 110 + Math.min((row.err.stack?.match(/\n/g) ?? []).length * 16, 200) : 0) +
        (params === undefined ? 0 : 30 + monospaceLines(JSON.stringify(params, null, 2)) * 15);
    // Sixty columns rather than eighty: the message column is the wide one, but a long path wraps in
    // it, and an estimate that assumes more room than there is leaves the last line under the fold.
    return clamp(monospaceLines(row.msg ?? '', 60) * 18 + 14 + blocks, DETAIL_MIN, DETAIL_MAX);
}

/** The height a row is drawn at: the detail it shows, or one line when it is closed. */
function rowHeightOf(row: LogEntry, expanded: IExpandedRows): number {
    const json = expanded.json.has(row.id);
    const message = expanded.message.has(row.id);
    if (!json && !message) return SINGLE_ROW_HEIGHT;
    const detail = Math.max(
        json ? detailHeightOf(row, 'json') : 0,
        message ? detailHeightOf(row, 'message') : 0,
    );
    return Math.min(detail, DETAIL_MAX) + CELL_CHROME;
}

/**
 * The height of a row that is not expanded.
 *
 * The cells are padded 8px top and bottom by the theme and have a one-pixel border, so the row has to be
 * the line plus the padding or the text is cut in half — which is what a 28px row was doing to every
 * column. The padding is cut to 4px and the line to 16px, so 26px draws a full line with room around
 * it, and a 1080-high window holds forty rows.
 */
const SINGLE_ROW_HEIGHT = 26;

/** The scroll viewport every expanded detail shares; its height comes from the record. */
const EXPANDED_DETAIL_STYLE: CSSProperties = {
    overflow: 'auto',
    // Room for the scrollbar, so a scrollable panel does not render the end of a line underneath it.
    paddingRight: '2px',
};

/** Whether this row's message is expanded, and the toggle for it. */
function useMessageExpanded(rowId: string): {isExpanded: boolean; toggle: () => void} {
    const {onToggleExpanded} = use(ViewerContext);
    const expanded = React.use(ExpandedRowsContext);
    return {
        isExpanded: expanded?.message.has(rowId) ?? false,
        toggle: useCallback(() => onToggleExpanded(rowId, 'message'), [onToggleExpanded, rowId]),
    };
}

/** Whether this row's JSON is expanded, and the toggle for it. */
function useJsonExpanded(rowId: string): {isExpanded: boolean; toggle: () => void} {
    const {onToggleExpanded} = use(ViewerContext);
    const expanded = React.use(ExpandedRowsContext);
    return {
        isExpanded: expanded?.json.has(rowId) ?? false,
        toggle: useCallback(() => onToggleExpanded(rowId, 'json'), [onToggleExpanded, rowId]),
    };
}

// ── Utility functions ─────────────────────────────────────────────────────────

function formatTimestamp(time: number | undefined): string {
    if (!time) return '';
    // Ensure timestamp is in milliseconds (Pino uses milliseconds)
    // If the timestamp is suspiciously small (< 10000000000), assume it's in seconds
    const timeMs = time < 10000000000 ? time * 1000 : time;
    const d = new Date(timeMs);
    // Use explicit time formatting to ensure consistency
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
}

function timeAgo(time: number | undefined): string {
    if (!time) return '';
    // Ensure timestamp is in milliseconds
    const timeMs = time < 10000000000 ? time * 1000 : time;
    const diff = Date.now() - timeMs;
    if (diff < 1000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Copy to Clipboard Component ───────────────────────────────────────────────

function CopyButton({text, isDark = true}: {text: string; isDark?: boolean}): React.ReactElement {
    const [copied, setCopied] = useState(false);

    const handleClick = (e: React.MouseEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(text).then(
            () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            },
            err => {
                console.error('Failed to copy:', err);
            },
        );
    };

    return (
        <button
            onClick={handleClick}
            onMouseDown={e => {
                e.stopPropagation();
                e.preventDefault();
            }}
            onMouseUp={e => {
                e.stopPropagation();
                e.preventDefault();
            }}
            onDoubleClick={e => {
                e.stopPropagation();
                e.preventDefault();
            }}
            style={{
                background: isDark ? 'rgba(110, 118, 129, 0.4)' : 'rgba(175, 184, 193, 0.2)',
                border: 'none',
                cursor: 'pointer',
                padding: '3px 6px',
                fontSize: '13px',
                color: isDark ? '#c9d1d9' : '#24292f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                flexShrink: 0,
                minWidth: '28px',
                height: '24px',
            }}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
            {copied ? '✓' : '📋'}
        </button>
    );
}

// ── SVAR Grid Cell Components ─────────────────────────────────────────────────

function LevelCell({row}: {row: LogEntry}): React.ReactElement {
    const {theme} = use(ViewerContext);
    const [isHovered, setIsHovered] = useState(false);
    const name = row.levelName ?? LEVEL_NAME[row.level ?? 30] ?? 'unknown';
    const colors = theme.levels ?? {};
    const color = (colors as Record<string, string>)[name] ?? '#6b7280';
    const isDark = theme.mode === 'dark';

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '18px',
                position: 'relative',
                paddingRight: isHovered ? '36px' : '0',
                flexWrap: 'nowrap',
                overflow: 'visible',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <span
                style={{
                    padding: '0 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    lineHeight: '16px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    color: '#fff',
                    background: color,
                    display: 'inline-block',
                    minWidth: '45px',
                    textAlign: 'center',
                    flexShrink: 0,
                }}
            >
                {name}
            </span>
            {isHovered && (
                <div
                    style={{
                        position: 'absolute',
                        right: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'auto',
                    }}
                >
                    <CopyButton
                        text={name}
                        isDark={isDark}
                    />
                </div>
            )}
        </div>
    );
}

function NameCell({row}: {row: LogEntry}): React.ReactElement {
    const {searchText, theme} = use(ViewerContext);
    const [isHovered, setIsHovered] = useState(false);
    const isDark = theme.mode === 'dark';
    // The service is the process; the identity an operator filters by is the port or component that
    // reported, which the record carries as `fields.context` (@@D-926).
    const service = serviceOf(row);
    const context = contextOf(row);

    return (
        <div
            style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                minHeight: '18px',
                position: 'relative',
                paddingRight: isHovered && service ? '36px' : '0',
            }}
            title={context === undefined ? (service ?? '') : `${service ?? ''} · ${context}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <span
                style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'flex',
                    gap: '6px',
                }}
            >
                <span>{highlightSearch(service ?? '', searchText)}</span>
                {context !== undefined && (
                    <span
                        style={{
                            color: isDark ? '#8b949e' : '#57606a',
                            fontSize: '11px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {highlightSearch(context, searchText)}
                    </span>
                )}
            </span>
            {isHovered && service && (
                <div
                    style={{
                        position: 'absolute',
                        right: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'auto',
                    }}
                >
                    <CopyButton
                        text={service}
                        isDark={isDark}
                    />
                </div>
            )}
        </div>
    );
}

function TraceLinkCell({row}: {row: LogEntry}): React.ReactElement | null {
    const {clientConfig, onTraceFilter, theme} = use(ViewerContext);
    const [isHovered, setIsHovered] = useState(false);
    const trace = traceOf(row);

    if (trace === undefined) return null;

    const isDark = theme.mode === 'dark';

    const handleFilterClick = (e: React.MouseEvent): void => {
        e.stopPropagation();
        onTraceFilter(trace);
    };

    const handleExternalLink = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (clientConfig?.traceUrlPattern) {
            const start = row.time ? (row.time as number) - 60000 : Date.now() - 3600000;
            const end = row.time ? (row.time as number) + 60000 : Date.now();
            const url = clientConfig.traceUrlPattern
                .replace('{traceId}', trace)
                .replace('{startTime}', String(start))
                .replace('{endTime}', String(end));
            window.open(url, '_blank');
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                minHeight: '18px',
                position: 'relative',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {clientConfig?.traceUrlPattern && (
                <span
                    style={{
                        cursor: 'pointer',
                        color: '#58a6ff',
                        fontSize: '14px',
                        lineHeight: '1',
                    }}
                    onClick={handleExternalLink}
                    title="Open trace in external viewer"
                >
                    ↗
                </span>
            )}
            <span
                style={{
                    cursor: 'pointer',
                    color: '#58a6ff',
                    textDecoration: 'underline',
                    fontSize: '12px',
                }}
                onClick={handleFilterClick}
                title="Click to filter by this trace ID"
            >
                {trace.substring(0, 16) + '\u2026'}
            </span>
            {isHovered && (
                <div
                    style={{
                        position: 'absolute',
                        right: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                    }}
                >
                    <CopyButton
                        text={trace}
                        isDark={isDark}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * The declared identifier, which is the line's identity since the conversion.
 *
 * A level says how loud a line is; an identifier says what happened, and it is what an operator filters
 * by, raises or silences. A capture's identifier is the same token, so the cell marks the ones that
 * carry a payload — that is what the expanded row will draw (`@@D-926`).
 */
function SignalCell({row}: {row: LogEntry}): React.ReactElement {
    const {theme, searchText} = use(ViewerContext);
    const isDark = isDarkMode(theme);
    const signal = signalOf(row);
    const capture = captureOf(row);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                minHeight: '18px',
                overflow: 'hidden',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '11px',
            }}
            title={capture === undefined ? (signal ?? '') : `${signal ?? ''} · ${capture.shape}`}
        >
            {capture !== undefined && (
                <span
                    style={{
                        flexShrink: 0,
                        padding: '0 4px',
                        borderRadius: '3px',
                        background: isDark ? 'rgba(56, 139, 253, 0.25)' : '#ddf4ff',
                        color: isDark ? '#79c0ff' : '#0969da',
                    }}
                >
                    ⌗
                </span>
            )}
            <span
                style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: signal === undefined ? (isDark ? '#6e7681' : '#8c959f') : undefined,
                }}
            >
                {highlightSearch(signal ?? '—', searchText)}
            </span>
        </div>
    );
}

function MessageCell({row}: {row: LogEntry}): React.ReactElement {
    const {searchText, theme, onFilterText} = use(ViewerContext);
    const {isExpanded, toggle} = useMessageExpanded(row.id);
    const [isHovered, setIsHovered] = useState(false);
    const isDark = isDarkMode(theme);
    const capture = captureOf(row);
    const decision = decisionOf(row);
    const exchange = exchangeOf(row);

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            // Only toggle if not clicking on copy button or its wrapper
            if ((e.target as HTMLElement).closest('[data-copy-button]')) {
                return;
            }
            toggle();
        },
        [toggle],
    );

    const baseStyle: CSSProperties = {
        overflow: 'hidden',
        fontSize: '12px',
        lineHeight: '16px',
    };

    const singleLineStyle: CSSProperties = {
        ...baseStyle,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        minHeight: '18px',
    };

    const multiLineStyle: CSSProperties = {
        ...baseStyle,
        wordBreak: 'break-word',
        padding: '4px 0',
        // An expanded row may be wider than its column — a hex dump is — and a dump clipped at the cell
        // edge is a dump a reader has to widen the column to finish reading.
        overflow: 'auto',
    };

    /**
     * `pre-wrap` belongs on the text, not on the cell that holds it.
     *
     * On the cell it made every newline and every indent between the elements of this JSX a rendered
     * line, so an expanded record began with a band of blank space above its first panel — the space a
     * `white-space` rule reserves for whitespace that a layout would otherwise collapse.
     */
    const textStyle: CSSProperties = {whiteSpace: 'pre-wrap'};

    // Build full text content for copying
    const getFullText = (): string => {
        let text = row.msg ?? '';

        if (row.err) {
            text += `\n\n[${row.err.type ?? 'Error'}: ${row.err.message ?? 'No message'}]`;
            if (row.err.stack) {
                text += `\n${row.err.stack}`;
            }
        }

        if (row.req) {
            text += `\n\n=== HTTP Request ===\n${row.req.method ?? 'GET'} ${row.req.url ?? ''}`;
            if (row.req.headers) {
                text += '\n\nHeaders:';
                Object.entries(row.req.headers).forEach(([key, value]) => {
                    text += `\n${key}: ${value}`;
                });
            }
            if (row.req.body) {
                text += `\n\nRequest Body:\n${JSON.stringify(row.req.body, null, 2)}`;
            }
        }

        if (row.res) {
            text += `\n\n=== HTTP Response ===\nStatus: ${row.res.statusCode ?? 200}`;
            if (row.res.responseTime) {
                text += ` (${row.res.responseTime}ms)`;
            }
            if (row.res.headers) {
                text += '\n\nHeaders:';
                Object.entries(row.res.headers).forEach(([key, value]) => {
                    text += `\n${key}: ${value}`;
                });
            }
            if (row.res.body) {
                text += `\n\nResponse Body:\n${JSON.stringify(row.res.body, null, 2)}`;
            }
        }

        return text;
    };

    // Message is always just the string, no JSON parsing
    const messageContent = highlightSearch(row.msg ?? '', searchText);

    if (!isExpanded) {
        return (
            <div
                style={{
                    ...singleLineStyle,
                    position: 'relative',
                    cursor: 'pointer',
                }}
                title={row.msg ?? ''}
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <span
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: isHovered ? '36px' : '0',
                    }}
                >
                    {messageContent}
                    {row.err && (
                        <span style={{color: theme.levels?.error ?? '#ef4444', marginLeft: '8px'}}>
                            {highlightSearch(
                                ` [${row.err.type ?? 'Error'}: ${row.err.message ?? ''}]`,
                                searchText,
                            )}
                        </span>
                    )}
                </span>
                {isHovered && (
                    <div
                        data-copy-button
                        style={{
                            position: 'absolute',
                            right: '4px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'auto',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        onMouseUp={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                    >
                        <CopyButton
                            text={getFullText()}
                            isDark={isDark}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Expanded view - show message with additional details
    return (
        <div
            style={{...multiLineStyle, position: 'relative', cursor: 'pointer'}}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {' '}
            {isHovered && (
                <div
                    data-copy-button
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        zIndex: 10,
                        pointerEvents: 'auto',
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseUp={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={e => e.stopPropagation()}
                >
                    <CopyButton
                        text={getFullText()}
                        isDark={isDark}
                    />
                </div>
            )}
            {/* A capture's message is the shape's own words — `tcp frame` — and the panel below opens
                with the shape itself, so the sentence is not drawn at all: it is the one line an
                expanded capture can do without (`@@D-926`). */}
            <div
                style={{...EXPANDED_DETAIL_STYLE, maxHeight: `${detailHeightOf(row, 'message')}px`}}
            >
                {capture === undefined && (
                    <div style={{...textStyle, marginBottom: '4px'}}>{messageContent}</div>
                )}

                {/* Exception details */}
                {row.err && (
                    <div
                        style={{
                            marginBottom: '8px',
                            padding: '8px',
                            background: isDarkMode(theme) ? '#1c2128' : '#fff8e6',
                            borderLeft: `3px solid ${theme.levels?.error ?? '#ef4444'}`,
                            borderRadius: '4px',
                        }}
                    >
                        <div
                            style={{
                                color: theme.levels?.error ?? '#ef4444',
                                fontWeight: 'bold',
                                marginBottom: '4px',
                            }}
                        >
                            {highlightSearch(
                                `${row.err.type ?? 'Error'}: ${row.err.message ?? 'No message'}`,
                                searchText,
                            )}
                        </div>
                        {row.err.stack && (
                            <div
                                style={{
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre',
                                }}
                            >
                                {highlightSearch(row.err.stack, searchText)}
                            </div>
                        )}
                    </div>
                )}

                {/* What the record carries beside its sentence: the branch it reports, the call it is part
                of, on whose behalf it ran, and what caused it. Then the exchange, in either spelling —
                the panel used to read only the pino era's and showed an empty request line for a
                lukaot record (@@D-926). */}
                <RecordContextStrip
                    record={row}
                    theme={theme}
                    onFilter={onFilterText}
                />
                {exchange !== undefined && (
                    <ExchangePanel
                        exchange={exchange}
                        theme={theme}
                        searchText={searchText}
                    />
                )}
                {decision !== undefined && (
                    <DecisionPanel
                        decision={decision}
                        theme={theme}
                    />
                )}

                {/* The capture this record carries, drawn by the shape that produced it, and the values a
                declared signal was called with — the two things lukaot added that a line cannot show
                on its own (@@D-926). */}
                <CapturePanel
                    record={row}
                    theme={theme}
                />
                {paramsOf(row) !== undefined && (
                    <div
                        style={{
                            marginTop: '4px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            borderLeft: `3px solid ${isDarkMode(theme) ? '#6e7681' : '#8c959f'}`,
                            background: isDarkMode(theme) ? '#161b22' : '#f6f8fa',
                            fontSize: '10px',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                    >
                        <div style={{marginBottom: '4px', fontWeight: 'bold'}}>
                            {/* The identifier is the signal column already; what a reader needs here is
                            the operation it was about and the kind of event it was. */}
                            {[operationOf(row), messageIdOf(row)]
                                .filter((fact): fact is string => fact !== undefined)
                                .join(' · ')}
                        </div>
                        <div style={textStyle}>
                            <SyntaxHighlight
                                json={JSON.stringify(paramsOf(row), null, 2)}
                                theme={theme}
                                searchText={searchText}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function isDarkMode(theme: ThemeConfig): boolean {
    return theme.mode === 'dark';
}

function JSONCell({row}: {row: LogEntry}): React.ReactElement {
    const {theme, searchText} = use(ViewerContext);
    const {isExpanded, toggle} = useJsonExpanded(row.id);
    const [isHovered, setIsHovered] = useState(false);
    const isDark = isDarkMode(theme);

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            // Only toggle if not clicking on copy button or its wrapper
            if ((e.target as HTMLElement).closest('[data-copy-button]')) {
                return;
            }
            toggle();
        },
        [toggle],
    );

    const jsonString = JSON.stringify(row, null, 2);

    if (!isExpanded) {
        return (
            <div
                style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: '18px',
                    position: 'relative',
                    cursor: 'pointer',
                }}
                title={jsonString}
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <span
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: isHovered ? '36px' : '0',
                    }}
                >
                    {JSON.stringify(row)}
                </span>
                {isHovered && (
                    <div
                        data-copy-button
                        style={{
                            position: 'absolute',
                            right: '4px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'auto',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        onMouseUp={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                    >
                        <CopyButton
                            text={jsonString}
                            isDark={isDark}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Expanded view with syntax highlighting
    return (
        <div
            style={{
                ...EXPANDED_DETAIL_STYLE,
                maxHeight: `${detailHeightOf(row, 'json')}px`,
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                padding: '6px 0',
                position: 'relative',
                cursor: 'pointer',
            }}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {isHovered && (
                <div
                    data-copy-button
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        zIndex: 10,
                        pointerEvents: 'auto',
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseUp={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={e => e.stopPropagation()}
                >
                    <CopyButton
                        text={jsonString}
                        isDark={isDark}
                    />
                </div>
            )}
            <SyntaxHighlight
                json={jsonString}
                theme={theme}
                searchText={searchText}
            />
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function HttpCell({row}: {row: LogEntry}): React.ReactElement {
    const statusColor = row.res
        ? (row.res.statusCode ?? 200) < 400
            ? '#22c55e'
            : '#ef4444'
        : undefined;
    return (
        <div
            style={{
                display: 'flex',
                gap: '8px',
                fontSize: '12px',
                alignItems: 'center',
                minHeight: '18px',
            }}
        >
            {row.req && (
                <span title={JSON.stringify(row.req, null, 2)}>
                    {`${row.req.method ?? 'GET'} ${row.req.url ?? ''}`}
                </span>
            )}
            {row.res && (
                <span title={JSON.stringify(row.res, null, 2)}>
                    <span style={{color: statusColor, fontWeight: 'bold'}}>
                        {String(row.res.statusCode ?? '')}
                    </span>
                    {row.res.responseTime ? ` ${row.res.responseTime}ms` : ''}
                </span>
            )}
        </div>
    );
}

// ── JSON Syntax Highlighting ──────────────────────────────────────────────────

// ── Entry Detail Modal ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EntryModal({
    entry,
    isDark,
    onClose,
}: {
    entry: LogEntry;
    isDark: boolean;
    onClose: () => void;
}): React.ReactElement {
    const [wrapText, setWrapText] = useState(false);
    const {theme, searchText} = use(ViewerContext);
    const jsonString = JSON.stringify(entry, null, 2);

    const sectionHeaderStyle: CSSProperties = {
        fontSize: '13px',
        fontWeight: 'bold',
        marginTop: '16px',
        marginBottom: '8px',
        color: isDark ? '#c9d1d9' : '#24292f',
    };

    const sectionStyle: CSSProperties = {
        background: isDark ? '#0d1117' : '#f6f8fa',
        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        borderRadius: '6px',
        padding: '12px',
        marginBottom: '12px',
        fontSize: '12px',
        fontFamily: 'monospace',
    };

    return (
        <div
            style={
                {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 100,
                } as CSSProperties
            }
            onClick={onClose}
        >
            <div
                style={{
                    background: isDark ? '#161b22' : '#ffffff',
                    border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    maxWidth: '80vw',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    minWidth: '600px',
                }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                <div
                    style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px'}}
                >
                    <h3 style={{fontSize: '14px', fontWeight: 'bold'}}>Log Entry Details</h3>
                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                        <label style={{fontSize: '12px', cursor: 'pointer'}}>
                            <input
                                type="checkbox"
                                checked={wrapText}
                                onChange={() => setWrapText(w => !w)}
                                style={{marginRight: '4px'}}
                            />
                            Wrap text
                        </label>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: '18px',
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Exception section */}
                {entry.err && (
                    <div>
                        <div style={sectionHeaderStyle}>Exception</div>
                        <div style={sectionStyle}>
                            <div
                                style={{
                                    color: theme.levels?.error ?? '#ef4444',
                                    fontWeight: 'bold',
                                    marginBottom: '8px',
                                }}
                            >
                                {`${entry.err.type ?? 'Error'}: ${entry.err.message ?? 'No message'}`}
                            </div>
                            {entry.err.stack && (
                                <div style={{whiteSpace: 'pre-wrap', lineHeight: '1.5'}}>
                                    {entry.err.stack}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* HTTP Request section */}
                {entry.req && (
                    <div>
                        <div style={sectionHeaderStyle}>HTTP Request</div>
                        <div style={sectionStyle}>
                            <div style={{fontWeight: 'bold', marginBottom: '8px'}}>
                                {`${entry.req.method ?? 'GET'} ${entry.req.url ?? ''}`}
                            </div>
                            {entry.req.headers && (
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 'bold',
                                            marginTop: '8px',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        Headers:
                                    </div>
                                    <table style={{width: '100%', fontSize: '11px'}}>
                                        <tbody>
                                            {Object.entries(entry.req.headers).map(
                                                ([key, value]) => (
                                                    <tr key={key}>
                                                        <td
                                                            style={{
                                                                padding: '2px 8px 2px 0',
                                                                verticalAlign: 'top',
                                                                color: isDark
                                                                    ? '#79c0ff'
                                                                    : '#0969da',
                                                            }}
                                                        >
                                                            {key}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding: '2px 0',
                                                                verticalAlign: 'top',
                                                            }}
                                                        >
                                                            {value}
                                                        </td>
                                                    </tr>
                                                ),
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {!!entry.req.body && (
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 'bold',
                                            marginTop: '8px',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        Body:
                                    </div>
                                    <pre style={{margin: 0, whiteSpace: 'pre-wrap'}}>
                                        {typeof entry.req.body === 'string' ? (
                                            entry.req.body
                                        ) : (
                                            <SyntaxHighlight
                                                json={JSON.stringify(entry.req.body, null, 2)}
                                                theme={theme}
                                                searchText={searchText}
                                            />
                                        )}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* HTTP Response section */}
                {entry.res && (
                    <div>
                        <div style={sectionHeaderStyle}>HTTP Response</div>
                        <div style={sectionStyle}>
                            <div style={{fontWeight: 'bold', marginBottom: '8px'}}>
                                <span
                                    style={{
                                        color:
                                            (entry.res.statusCode ?? 200) < 400
                                                ? '#22c55e'
                                                : '#ef4444',
                                    }}
                                >
                                    {entry.res.statusCode ?? 200}
                                </span>
                                {entry.res.responseTime ? ` (${entry.res.responseTime}ms)` : ''}
                            </div>
                            {entry.res.headers && (
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 'bold',
                                            marginTop: '8px',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        Headers:
                                    </div>
                                    <table style={{width: '100%', fontSize: '11px'}}>
                                        <tbody>
                                            {Object.entries(entry.res.headers).map(
                                                ([key, value]) => (
                                                    <tr key={key}>
                                                        <td
                                                            style={{
                                                                padding: '2px 8px 2px 0',
                                                                verticalAlign: 'top',
                                                                color: isDark
                                                                    ? '#79c0ff'
                                                                    : '#0969da',
                                                            }}
                                                        >
                                                            {key}
                                                        </td>
                                                        <td
                                                            style={{
                                                                padding: '2px 0',
                                                                verticalAlign: 'top',
                                                            }}
                                                        >
                                                            {value}
                                                        </td>
                                                    </tr>
                                                ),
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {!!entry.res.body && (
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 'bold',
                                            marginTop: '8px',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        Body:
                                    </div>
                                    <pre style={{margin: 0, whiteSpace: 'pre-wrap'}}>
                                        {typeof entry.res.body === 'string' ? (
                                            entry.res.body
                                        ) : (
                                            <SyntaxHighlight
                                                json={JSON.stringify(entry.res.body, null, 2)}
                                                theme={theme}
                                                searchText={searchText}
                                            />
                                        )}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Raw JSON section */}
                <div style={sectionHeaderStyle}>Raw Entry</div>
                <pre
                    style={{
                        whiteSpace: wrapText ? 'pre-wrap' : 'pre',
                        wordBreak: wrapText ? 'break-all' : undefined,
                        fontFamily: 'inherit',
                        fontSize: '12px',
                        overflow: 'auto',
                        maxHeight: '65vh',
                        background: isDark ? '#0d1117' : '#f6f8fa',
                        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                        borderRadius: '6px',
                        padding: '12px',
                    }}
                >
                    <SyntaxHighlight
                        json={jsonString}
                        theme={theme}
                        searchText={searchText}
                    />
                </pre>
            </div>
        </div>
    );
}

// ── Main LogViewer Component ──────────────────────────────────────────────────

export interface LogViewerProps {
    /** Server config URL or direct config object */
    config?: string | ClientConfig;
    /** Override theme */
    theme?: ThemeConfig;
    /** Initial search text (for Storybook demos) */
    initialSearchText?: string;
    /** Initial set of rows whose message is expanded (for Storybook demos) */
    initialExpandedRows?: Set<string>;
    /** Initial set of rows whose JSON is expanded (for Storybook demos) */
    initialExpandedJsonRows?: Set<string>;
}

export function LogViewer({
    config: configProp,
    theme: themeProp,
    initialSearchText = '',
    initialExpandedRows,
    initialExpandedJsonRows,
}: LogViewerProps): React.ReactElement {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
    const [connected, setConnected] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({});
    const [searchText, setSearchText] = useState(initialSearchText);
    const [expandedRows, setExpandedRows] = useState<IExpandedRows>(() => ({
        message: initialExpandedRows ?? new Set(),
        json: initialExpandedJsonRows ?? new Set(),
    }));
    const [autoScroll, setAutoScroll] = useState(false);
    const [timeMode, setTimeMode] = useState<'absolute' | 'relative'>('absolute');
    const wsRef = useRef<WebSocket | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gridApiRef = useRef<any>(null);
    const lastIdRef = useRef<string>('');
    const entriesRef = useRef<LogEntry[]>([]);
    const filtersRef = useRef<FilterOptions>({});

    // Track unique service names for autocomplete
    const uniqueServiceNames = useMemo(() => {
        const names = new Set<string>();
        entries.forEach(e => {
            const context = contextOf(e);
            const service = serviceOf(e);
            if (context !== undefined) names.add(context);
            else if (service !== undefined) names.add(service);
        });
        return Array.from(names).sort();
    }, [entries]);

    // The declared identifiers a reader may filter by, and the shapes the entries carry.
    const uniqueSignals = useMemo(() => {
        const signals = new Set<string>();
        for (const entry of entries) {
            const signal = signalOf(entry);
            if (signal !== undefined) signals.add(signal);
        }
        return Array.from(signals).sort();
    }, [entries]);

    const uniqueShapes = useMemo(() => {
        const shapes = new Set<string>();
        for (const entry of entries) {
            const capture = captureOf(entry);
            if (capture !== undefined) shapes.add(capture.shape);
        }
        return Array.from(shapes).sort();
    }, [entries]);

    const theme = useMemo(
        () => ({...(clientConfig?.theme ?? {}), ...themeProp}),
        [clientConfig?.theme, themeProp],
    );

    const isDark = theme.mode === 'dark';

    // Keep entries and filters refs current for use in stable callbacks
    entriesRef.current = entries;
    filtersRef.current = filters;

    // ── Load config ───────────────────────────────────────────────────────

    useEffect(() => {
        if (typeof configProp === 'object' && configProp) {
            // eslint-disable-next-line @eslint-react/set-state-in-effect
            setClientConfig(configProp);
            return;
        }
        const configUrl = typeof configProp === 'string' ? configProp : '/api/config';
        fetch(configUrl)
            .then(r => r.json())
            .then(setClientConfig)
            .catch(err => console.error('[blong-log] Failed to load config:', err));
    }, [configProp]);

    // ── WebSocket connection ──────────────────────────────────────────────

    useEffect(() => {
        if (!clientConfig) return;

        const wsUrl = clientConfig.wsUrl;
        let ws: WebSocket;
        let reconnectTimer: ReturnType<typeof setTimeout>;

        function connect(): void {
            ws = new WebSocket(wsUrl);

            ws.onopen = (): void => {
                setConnected(true);
                const msg: WsMessage = {type: 'subscribe', filters: filtersRef.current};
                ws.send(JSON.stringify(msg));
            };

            ws.onmessage = (event: MessageEvent): void => {
                try {
                    const msg: WsMessage = JSON.parse(String(event.data));
                    if (msg.type === 'entries') {
                        setEntries(prev => {
                            const combined = [...prev, ...msg.entries];
                            const seen = new Set<string>();
                            const unique = combined.filter(e => {
                                if (seen.has(e.id)) return false;
                                seen.add(e.id);
                                return true;
                            });
                            unique.sort((a, b) => a.id.localeCompare(b.id));
                            if (unique.length > 0) {
                                lastIdRef.current = unique[unique.length - 1].id;
                            }
                            return unique;
                        });
                    } else if (msg.type === 'entry') {
                        setEntries(prev => {
                            const next = [...prev, msg.entry];
                            lastIdRef.current = msg.entry.id;
                            if (next.length > 10000) return next.slice(-5000);
                            return next;
                        });
                    }
                } catch {
                    // Ignore malformed messages
                }
            };

            ws.onclose = (): void => {
                setConnected(false);
                reconnectTimer = setTimeout(connect, 3000);
            };

            ws.onerror = (): void => {
                ws.close();
            };

            wsRef.current = ws;
        }

        connect();

        return (): void => {
            clearTimeout(reconnectTimer);
            if (ws) ws.close();
            wsRef.current = null;
        };
    }, [clientConfig]);

    // ── Re-subscribe when filters change ──────────────────────────────────
    // Note: We do client-side filtering in displayEntries, so we don't clear
    // entries here. The server can optionally use filters for future data.

    useEffect(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const msg: WsMessage = {type: 'subscribe', filters};
            wsRef.current.send(JSON.stringify(msg));
            // Don't clear entries - we filter client-side
        }
    }, [filters]);

    // ── Auto-scroll on new entries ────────────────────────────────────────

    useEffect(() => {
        if (autoScroll && lastIdRef.current && gridApiRef.current) {
            try {
                gridApiRef.current.exec('scroll', {row: lastIdRef.current});
            } catch {
                // Grid may not be ready
            }
        }
    }, [entries, autoScroll]);

    // ── Filter handlers ───────────────────────────────────────────────────

    const handleLevelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
        setFilters(f => ({...f, level: e.target.value || undefined}));
    }, []);

    const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
        setFilters(f => ({...f, name: e.target.value || undefined}));
    }, []);

    const handleSignalChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
        setFilters(f => ({...f, signal: e.target.value || undefined}));
    }, []);

    const handleCaptureChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>): void => {
        setFilters(f => ({...f, capture: e.target.value || undefined}));
    }, []);

    const handleHasErrorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
        setFilters(f => ({...f, hasError: e.target.checked || undefined}));
    }, []);

    const handleCustomPropertyChange = useCallback((propName: string, value: string): void => {
        setFilters(f => ({
            ...f,
            properties: value
                ? {...(f.properties ?? {}), [propName]: value}
                : (() => {
                      const {[propName]: _, ...rest} = f.properties ?? {};
                      return Object.keys(rest).length > 0 ? rest : undefined;
                  })(),
        }));
    }, []);

    const handleTraceFilter = useCallback((traceId: string): void => {
        setFilters(f => (f.traceId === traceId ? {...f, traceId: undefined} : {...f, traceId}));
    }, []);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
        setSearchText(e.target.value);
    }, []);

    const handleSearchSubmit = useCallback(
        (e: React.KeyboardEvent): void => {
            if (e.key === 'Enter') {
                setFilters(f => ({...f, search: searchText || undefined}));
            }
        },
        [searchText],
    );

    const clearFilters = useCallback((): void => {
        setFilters({});
        setSearchText('');
    }, []);

    // ── Client-side search filtering ──────────────────────────────────────

    const displayEntries = useMemo(() => {
        let result = entries;

        // Apply traceId filter
        if (filters.traceId) {
            result = result.filter(e => traceOf(e) === filters.traceId);
        }

        // Apply level filter
        if (filters.level) {
            const minLevel =
                Object.entries({
                    trace: 10,
                    debug: 20,
                    info: 30,
                    warn: 40,
                    error: 50,
                    fatal: 60,
                }).find(([name]) => name === filters.level)?.[1] ?? 30;
            result = result.filter(e => (e.level ?? 30) >= minLevel);
        }

        // Apply service name filter — the port or component that reported, falling back to the
        // service when a record carries no context.
        if (filters.name) {
            result = result.filter(e => (contextOf(e) ?? serviceOf(e)) === filters.name);
        }

        // Apply the declared-signal filter: one identifier, one case.
        if (filters.signal) {
            result = result.filter(e => signalOf(e) === filters.signal);
        }

        // Apply the capture filter: the shape that rendered the payload.
        if (filters.capture) {
            result = result.filter(e => captureOf(e)?.shape === filters.capture);
        }

        // Apply error filter
        if (filters.hasError) {
            result = result.filter(e => e.err || (e.level ?? 0) >= 50);
        }

        // Apply search text filter
        if (searchText) {
            const search = searchText.toLowerCase();
            result = result.filter(e => JSON.stringify(e).toLowerCase().includes(search));
        }

        return result;
    }, [entries, searchText, filters]);

    /**
     * The rows the grid is given, each carrying the height it is drawn at.
     *
     * The grid reads a row's height off the row (`rowHeight`), not from a function: given a function it
     * falls back to one height for every row. And the height is decided from the expansion state alone —
     * never measured — so a row drawn again after being scrolled out of view keeps the height it had and
     * the table's scroll position does not move (`@@F-774`).
     */
    const gridRows = useMemo(
        () =>
            displayEntries.map(entry => ({
                ...entry,
                rowHeight: rowHeightOf(entry, expandedRows),
            })),
        [displayEntries, expandedRows],
    );

    // ── Grid columns ──────────────────────────────────────────────────────

    const columns = useMemo(
        () => [
            {
                id: 'time',
                header: (
                    <span
                        style={{cursor: 'pointer', userSelect: 'none'}}
                        onClick={() =>
                            setTimeMode(m => (m === 'absolute' ? 'relative' : 'absolute'))
                        }
                        title="Click to toggle between absolute and relative time"
                    >
                        {timeMode === 'absolute' ? 'Time' : 'Ago'}
                    </span>
                ),
                width: timeMode === 'absolute' ? 105 : 65,
                cell: ({row}: {row: LogEntry}) => {
                    // eslint-disable-next-line @eslint-react/rules-of-hooks
                    const [isHovered, setIsHovered] = useState(false);
                    const timeText =
                        timeMode === 'absolute' ? formatTimestamp(row.time) : timeAgo(row.time);
                    // Ensure timestamp is in milliseconds for ISO string
                    const timeMs = row.time && row.time < 10000000000 ? row.time * 1000 : row.time;
                    const fullTimeText = timeMs ? new Date(timeMs).toISOString() : '';

                    return (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                minHeight: '18px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                position: 'relative',
                                paddingRight: isHovered && fullTimeText ? '36px' : '0',
                                flexWrap: 'nowrap',
                                overflow: 'visible',
                            }}
                            onMouseDown={e => {
                                e.stopPropagation();
                                setTimeMode(m => (m === 'absolute' ? 'relative' : 'absolute'));
                            }}
                            onMouseUp={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                            onDoubleClick={e => e.stopPropagation()}
                            title="Click to toggle between absolute and relative time"
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                        >
                            <span style={{flexShrink: 0}}>{timeText}</span>
                            {isHovered && fullTimeText && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        right: '4px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        pointerEvents: 'auto',
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    onMouseUp={e => e.stopPropagation()}
                                    onClick={e => e.stopPropagation()}
                                    onDoubleClick={e => e.stopPropagation()}
                                >
                                    <CopyButton
                                        text={fullTimeText}
                                        isDark={isDark}
                                    />
                                </div>
                            )}
                        </div>
                    );
                },
            },
            {
                id: 'level',
                header: 'Level',
                width: 70,
                cell: LevelCell,
            },
            {
                id: 'name',
                header: 'Where',
                width: 150,
                cell: NameCell,
            },
            {
                id: 'signal',
                header: 'Signal',
                // Narrow, and the first to give up room: most rows have no signal at all, and one that
                // does is identified by the start of its name.
                width: 150,
                resizable: true,
                cell: SignalCell,
            },
            {
                id: 'traceId',
                header: 'Trace ID',
                width: 120,
                cell: TraceLinkCell,
            },
            {
                id: 'msg',
                header: 'Message',
                // The two wide columns grow into whatever the window has left over, in proportion, so a
                // wider window is more message and more JSON rather than more empty space. A hex dump
                // needs about 620px to fit without scrolling; `flexgrow` gives it that on a 1920 screen
                // and the expanded cell scrolls where it cannot.
                width: 420,
                flexgrow: 2,
                resizable: true,
                cell: MessageCell,
            },
            {
                id: 'json',
                header: 'JSON',
                width: 360,
                flexgrow: 1,
                resizable: true,
                cell: JSONCell,
            },
        ],
        [timeMode, isDark],
    );

    // ── Grid init (stable ref to avoid re-initialization) ─────────────────

    const initGrid = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (api: any) => {
            gridApiRef.current = api;
            // Removed select-row handler - expansion is now handled by MessageCell and JSONCell clicks
        },
        [],
    );

    // ── Row height calculation ────────────────────────────────────────────

    // ── Row styling (highlight trace-filtered rows) ───────────────────────

    const rowStyle = useCallback(
        (row: LogEntry) => {
            if (filters.traceId && traceOf(row) === filters.traceId)
                return 'blong-log-trace-highlight';
            return '';
        },
        [filters.traceId],
    );

    // ── Handle custom cell actions ────────────────────────────────────────

    const handleFilterTrace = useCallback(
        (ev: {traceId: string}) => {
            handleTraceFilter(ev.traceId);
        },
        [handleTraceFilter],
    );

    const handleToggleExpanded = useCallback((rowId: string, part: ExpandedPart) => {
        setExpandedRows(prev => {
            const next = new Set(prev[part]);
            if (next.has(rowId)) {
                next.delete(rowId);
            } else {
                next.add(rowId);
            }
            return {...prev, [part]: next};
        });
        // Trigger grid resize to recalculate row heights
        setTimeout(() => {
            if (gridApiRef.current?.exec) gridApiRef.current.exec('resize');
        }, 0);
    }, []);

    /**
     * Space toggles the focused row's detail, the way it toggles a disclosure in a file tree.
     *
     * The **column under the focus** decides which detail: a space in the JSON column opens the record's
     * JSON, anywhere else opens its message. The grid keeps the focus and the selection itself, so the
     * handler reads both off the element the key event came from — the cell's `data-col-id` and the
     * row's `data-row-id`, written as CSS-safe values with a leading colon (`:json`, `:perf-101`) — and
     * falls back to the row the grid marked selected. A space typed into the toolbar's inputs is not
     * ours: those are outside the wrapper this listens on.
     */
    const handleGridKeyDown = useCallback(
        (e: React.KeyboardEvent): void => {
            if (e.key !== ' ') return;
            const container = e.currentTarget as HTMLElement;
            const target = e.target as HTMLElement;
            const cell = target.closest<HTMLElement>('.wx-cell');
            const row =
                cell?.closest<HTMLElement>('.wx-row[data-id]') ??
                container.querySelector<HTMLElement>('.wx-row[data-id].wx-selected');
            // The grid writes both ids as CSS-safe attribute values, with a leading colon (`:json`);
            // what the expansion sets are keyed by is the record's own id and the column's own id.
            const bare = (value: string | undefined): string | undefined =>
                value?.startsWith(':') ? value.slice(1) : value;
            const rowId = bare(row?.dataset['id']);
            if (rowId === undefined) return;
            e.preventDefault();
            handleToggleExpanded(
                rowId,
                bare(cell?.dataset['colId']) === 'json' ? 'json' : 'message',
            );
        },
        [handleToggleExpanded],
    );

    // ── Context value ─────────────────────────────────────────────────────

    const contextValue = useMemo(
        () => ({
            theme,
            searchText,
            clientConfig,
            onTraceFilter: handleTraceFilter,
            onToggleExpanded: handleToggleExpanded,
            onFilterText: setSearchText,
        }),
        [theme, searchText, clientConfig, handleTraceFilter, handleToggleExpanded],
    );

    // ── Toolbar styles ────────────────────────────────────────────────────

    const toolbarStyle: CSSProperties = {
        display: 'flex',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        background: isDark ? '#161b22' : '#f6f8fa',
        alignItems: 'center',
        flexWrap: 'wrap',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    };

    const inputStyle: CSSProperties = {
        padding: '4px 8px',
        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        borderRadius: '4px',
        background: isDark ? '#0d1117' : '#ffffff',
        color: isDark ? '#c9d1d9' : '#24292f',
        fontSize: '12px',
        outline: 'none',
    };

    const selectStyle: CSSProperties = {
        padding: '4px 8px',
        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        borderRadius: '4px',
        background: isDark ? '#0d1117' : '#ffffff',
        color: isDark ? '#c9d1d9' : '#24292f',
        fontSize: '12px',
    };

    const statusBarStyle: CSSProperties = {
        display: 'flex',
        gap: '12px',
        padding: '4px 12px',
        borderTop: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        background: isDark ? '#161b22' : '#f6f8fa',
        fontSize: '11px',
        color: isDark ? '#8b949e' : '#57606a',
        alignItems: 'center',
    };

    const hasFilters =
        filters.level ||
        filters.name ||
        filters.signal ||
        filters.capture ||
        filters.traceId ||
        filters.search ||
        filters.hasError ||
        (filters.properties && Object.keys(filters.properties).length > 0);
    const ThemeWrapper = isDark ? WillowDark : Willow;

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <ViewerContext value={contextValue}>
            <ExpandedRowsContext value={expandedRows}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        background: isDark ? '#0d1117' : '#ffffff',
                        color: isDark ? '#c9d1d9' : '#24292f',
                    }}
                >
                    {/* Dynamic styles for trace highlight */}
                    <style>
                        {'.blong-log-trace-highlight:not(.selected) .cell { background: ' +
                            (isDark ? '#1c2128' : '#ddf4ff') +
                            ' !important; }'}
                        {/* Ensure theme wrapper fills container */}
                        {'.wx-theme { height: 100%; display: flex; flex-direction: column; }'}
                        {'.wx-grid { flex: 1; min-height: 0; }'}
                        {/* The theme sets a 14px font at a 20px line height on the row; the cells size
                            their own text and inherit it, which made every cell 20px of text in the
                            17px a 35px row leaves for it — the clipping every column showed. One line
                            height, and the row fits what the cells draw. */}
                        {'.wx-row, .wx-header { line-height: 16px; }'}
                        {/* The theme pads a cell by 8px vertically, which is most of a dense table's
                            row height spent on nothing. Four is still a comfortable gap between two
                            lines of text and puts ten more rows in the same window. */}
                        {
                            '.wx-row .wx-cell, .wx-header .wx-cell { padding-top: 4px; padding-bottom: 4px; }'
                        }
                    </style>

                    {/* Toolbar */}
                    <div style={toolbarStyle}>
                        <select
                            style={selectStyle}
                            value={filters.level ?? ''}
                            onChange={handleLevelChange}
                        >
                            <option value="">All Levels</option>
                            {['trace', 'debug', 'info', 'warn', 'error', 'fatal'].map(l => (
                                <option
                                    key={l}
                                    value={l}
                                >
                                    {l.toUpperCase()}
                                </option>
                            ))}
                        </select>

                        <input
                            style={{...inputStyle, width: '160px'}}
                            placeholder="Port or component..."
                            value={filters.name ?? ''}
                            onChange={handleNameChange}
                            list="service-names-datalist"
                        />

                        <select
                            style={selectStyle}
                            value={filters.signal ?? ''}
                            onChange={handleSignalChange}
                            title="Filter by the declared signal identifier"
                        >
                            <option value="">All signals</option>
                            {uniqueSignals.map(signal => (
                                <option
                                    key={signal}
                                    value={signal}
                                >
                                    {signal}
                                </option>
                            ))}
                        </select>

                        <select
                            style={selectStyle}
                            value={filters.capture ?? ''}
                            onChange={handleCaptureChange}
                            title="Filter by the capture shape"
                        >
                            <option value="">All shapes</option>
                            {uniqueShapes.map(shape => (
                                <option
                                    key={shape}
                                    value={shape}
                                >
                                    {shape}
                                </option>
                            ))}
                        </select>

                        {/* Datalist for service name autocomplete */}
                        <datalist id="service-names-datalist">
                            {uniqueServiceNames.map(name => (
                                <option
                                    key={name}
                                    value={name}
                                />
                            ))}
                        </datalist>

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                userSelect: 'none' as const,
                                color: isDark ? '#c9d1d9' : '#24292f',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={!!filters.hasError}
                                onChange={handleHasErrorChange}
                            />
                            Has Error
                        </label>

                        {/* Dynamic custom property filters */}
                        {clientConfig?.properties.custom
                            ?.filter(p => p.filterable)
                            .map(prop =>
                                prop.values ? (
                                    // Dropdown for predefined values
                                    <select
                                        key={prop.name}
                                        style={selectStyle}
                                        value={filters.properties?.[prop.name] ?? ''}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                            handleCustomPropertyChange(prop.name, e.target.value)
                                        }
                                    >
                                        <option value="">{`All ${prop.label}`}</option>
                                        {prop.values.map(val => (
                                            <option
                                                key={val}
                                                value={val}
                                            >
                                                {val}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    // Text input for free-form values
                                    <input
                                        key={prop.name}
                                        style={{...inputStyle, width: '140px'}}
                                        placeholder={`${prop.label}...`}
                                        value={filters.properties?.[prop.name] ?? ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            handleCustomPropertyChange(prop.name, e.target.value)
                                        }
                                    />
                                ),
                            )}

                        {filters.traceId && (
                            <span
                                style={{
                                    padding: '4px 8px',
                                    borderRadius: '3px',
                                    fontSize: '12px',
                                    background: '#1f6feb',
                                    color: '#fff',
                                    cursor: 'pointer',
                                }}
                                onClick={() => handleTraceFilter(filters.traceId!)}
                                title="Click to remove trace filter"
                            >
                                {'Trace: ' + filters.traceId.substring(0, 12) + '\u2026 \u00d7'}
                            </span>
                        )}

                        <input
                            style={{...inputStyle, flex: 1, minWidth: '200px'}}
                            placeholder="Search logs... (Enter to apply)"
                            value={searchText}
                            onChange={handleSearchChange}
                            onKeyDown={handleSearchSubmit}
                        />

                        {hasFilters && (
                            <button
                                style={{
                                    ...inputStyle,
                                    cursor: 'pointer',
                                    border: '1px solid #da3633',
                                    color: '#da3633',
                                }}
                                onClick={clearFilters}
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* SVAR Grid */}
                    <div
                        style={{flex: 1, overflow: 'hidden'}}
                        onKeyDown={handleGridKeyDown}
                    >
                        <ThemeWrapper>
                            <Grid
                                {...({
                                    data: gridRows,
                                    columns,
                                    select: true,
                                    rowStyle,
                                    rowHeight: SINGLE_ROW_HEIGHT,
                                    // The virtual scroller has to add up the same per-row heights the
                                    // rows are drawn at, or it computes the scroll range from the
                                    // default and an expanded row beyond the viewport cannot be
                                    // reached.
                                    _rowHeightFromData: true,
                                    init: initGrid,
                                    onFilterTrace: handleFilterTrace,
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                } as any)}
                            />
                        </ThemeWrapper>
                    </div>

                    {/* Status bar */}
                    <div style={statusBarStyle}>
                        <span
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                display: 'inline-block',
                                background: connected ? '#22c55e' : '#ef4444',
                            }}
                        />
                        <span>{connected ? 'Connected' : 'Disconnected'}</span>
                        <span>{displayEntries.length + ' entries'}</span>
                        <span
                            style={{cursor: 'pointer'}}
                            onClick={() => setAutoScroll(a => !a)}
                            title="Toggle auto-scroll"
                        >
                            {autoScroll ? '\u2b07 Auto-scroll' : '\u23f8 Paused'}
                        </span>
                    </div>
                </div>
            </ExpandedRowsContext>
        </ViewerContext>
    );
}

export default LogViewer;
