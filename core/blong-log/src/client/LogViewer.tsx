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
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {Grid, Willow, WillowDark} from '@svar-ui/react-grid';

import type {ClientConfig, FilterOptions, LogEntry, ThemeConfig, WsMessage} from '../types.js';
import {LEVEL_NAME} from '../types.js';

// ── Viewer Context ────────────────────────────────────────────────────────────

interface ViewerContextValue {
    theme: ThemeConfig;
    searchText: string;
    clientConfig: ClientConfig | null;
    onTraceFilter: (traceId: string) => void;
}

const ViewerContext = createContext<ViewerContextValue>({
    theme: {},
    searchText: '',
    clientConfig: null,
    onTraceFilter: () => {},
});

const ExpandedRowsContext = createContext<Set<string> | null>(null);

// ── Utility functions ─────────────────────────────────────────────────────────

function formatTimestamp(time: number | undefined): string {
    if (!time) return '';
    const d = new Date(time);
    return d.toLocaleTimeString('en-US', {hour12: false, fractionalSecondDigits: 3});
}

function timeAgo(time: number | undefined): string {
    if (!time) return '';
    const diff = Date.now() - time;
    if (diff < 1000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSearch(text: string, search: string): React.ReactNode {
    if (!search) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(search)})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase() ? (
            <mark
                key={i}
                style={{
                    background: '#e3b341',
                    color: '#000',
                    padding: '0 1px',
                    borderRadius: '2px',
                }}
            >
                {part}
            </mark>
        ) : (
            part
        ),
    );
}

// ── SVAR Grid Cell Components ─────────────────────────────────────────────────

function LevelCell({row}: {row: LogEntry}): React.ReactElement {
    const {theme} = useContext(ViewerContext);
    const name = row.levelName ?? LEVEL_NAME[row.level ?? 30] ?? 'unknown';
    const colors = theme.levels ?? {};
    const color = (colors as Record<string, string>)[name] ?? '#6b7280';

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '28px',
            }}
        >
            <span
                style={{
                    padding: '1px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    color: '#fff',
                    background: color,
                    display: 'inline-block',
                    minWidth: '45px',
                    textAlign: 'center',
                }}
            >
                {name}
            </span>
        </div>
    );
}

function NameCell({row}: {row: LogEntry}): React.ReactElement {
    const {searchText} = useContext(ViewerContext);
    return (
        <div
            style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                minHeight: '28px',
            }}
            title={row.name ?? ''}
        >
            {highlightSearch(row.name ?? '', searchText)}
        </div>
    );
}

function TraceLinkCell({row}: {row: LogEntry}): React.ReactElement | null {
    const {clientConfig, onTraceFilter} = useContext(ViewerContext);

    if (!row.traceId) return null;

    const handleFilterClick = (e: React.MouseEvent): void => {
        e.stopPropagation();
        onTraceFilter(row.traceId!);
    };

    const handleExternalLink = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (clientConfig?.traceUrlPattern) {
            const start = row.time ? (row.time as number) - 60000 : Date.now() - 3600000;
            const end = row.time ? (row.time as number) + 60000 : Date.now();
            const url = clientConfig.traceUrlPattern
                .replace('{traceId}', row.traceId!)
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
                minHeight: '28px',
            }}
        >
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
                {row.traceId.substring(0, 16) + '\u2026'}
            </span>
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
        </div>
    );
}

function MessageCell({row}: {row: LogEntry}): React.ReactElement {
    const {searchText, theme} = useContext(ViewerContext);
    const expandedRows = React.useContext(ExpandedRowsContext);
    const isExpanded = expandedRows?.has(row.id) ?? false;

    const baseStyle: CSSProperties = {
        overflow: 'hidden',
        fontSize: '12px',
    };

    const singleLineStyle: CSSProperties = {
        ...baseStyle,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        minHeight: '28px',
    };

    const multiLineStyle: CSSProperties = {
        ...baseStyle,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        padding: '8px 0',
    };

    // Message is always just the string, no JSON parsing
    const messageContent = highlightSearch(row.msg ?? '', searchText);

    if (!isExpanded) {
        return (
            <div
                style={singleLineStyle}
                title={row.msg ?? ''}
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
            </div>
        );
    }

    // Expanded view - show message with additional details
    return (
        <div style={multiLineStyle}>
            {/* Message */}
            <div style={{marginBottom: '8px'}}>{messageContent}</div>

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
                        <div style={{fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre'}}>
                            {highlightSearch(row.err.stack, searchText)}
                        </div>
                    )}
                </div>
            )}

            {/* HTTP Request details */}
            {row.req && (
                <div
                    style={{
                        marginBottom: '8px',
                        padding: '8px',
                        background: isDarkMode(theme) ? '#1c2128' : '#f0f6ff',
                        borderLeft: '3px solid #1f6feb',
                        borderRadius: '4px',
                    }}
                >
                    <div style={{fontWeight: 'bold', marginBottom: '4px', fontSize: '11px'}}>
                        {highlightSearch(
                            `${row.req.method ?? 'GET'} ${row.req.url ?? ''}`,
                            searchText,
                        )}
                    </div>
                    {row.req.headers && (
                        <div style={{fontSize: '10px', marginTop: '4px'}}>
                            {Object.entries(row.req.headers).map(([key, value]) => (
                                <div key={key}>
                                    <span
                                        style={{
                                            color: isDarkMode(theme) ? '#79c0ff' : '#0969da',
                                        }}
                                    >
                                        {key + ':'}
                                    </span>{' '}
                                    {highlightSearch(String(value), searchText)}
                                </div>
                            ))}
                        </div>
                    )}
                    {row.req.body && (
                        <div
                            style={{
                                marginTop: '6px',
                                fontSize: '10px',
                                background: isDarkMode(theme) ? '#161b22' : '#e8f0ff',
                                padding: '6px',
                                borderRadius: '3px',
                                fontFamily: 'monospace',
                            }}
                        >
                            <div
                                style={{
                                    color: isDarkMode(theme) ? '#79c0ff' : '#0969da',
                                    marginBottom: '3px',
                                }}
                            >
                                Request Body:
                            </div>
                            <SyntaxHighlight
                                json={JSON.stringify(row.req.body, null, 2)}
                                theme={theme}
                                searchText={searchText}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* HTTP Response details */}
            {row.res && (
                <div
                    style={{
                        padding: '8px',
                        background: isDarkMode(theme) ? '#1c2128' : '#f0fff4',
                        borderLeft: `3px solid ${(row.res.statusCode ?? 200) < 400 ? '#22c55e' : '#ef4444'}`,
                        borderRadius: '4px',
                    }}
                >
                    <div style={{fontWeight: 'bold', fontSize: '11px'}}>
                        <span
                            style={{
                                color: (row.res.statusCode ?? 200) < 400 ? '#22c55e' : '#ef4444',
                            }}
                        >
                            {row.res.statusCode ?? 200}
                        </span>
                        {row.res.responseTime ? ` (${row.res.responseTime}ms)` : ''}
                    </div>
                    {row.res.headers && (
                        <div style={{fontSize: '10px', marginTop: '4px'}}>
                            {Object.entries(row.res.headers).map(([key, value]) => (
                                <div key={key}>
                                    <span
                                        style={{
                                            color:
                                                (row.res.statusCode ?? 200) < 400
                                                    ? '#22c55e'
                                                    : '#ef4444',
                                        }}
                                    >
                                        {key + ':'}
                                    </span>{' '}
                                    {highlightSearch(String(value), searchText)}
                                </div>
                            ))}
                        </div>
                    )}
                    {row.res.body && (
                        <div
                            style={{
                                marginTop: '6px',
                                fontSize: '10px',
                                background: isDarkMode(theme) ? '#161b22' : '#e8fff0',
                                padding: '6px',
                                borderRadius: '3px',
                                fontFamily: 'monospace',
                            }}
                        >
                            <div
                                style={{
                                    color:
                                        (row.res.statusCode ?? 200) < 400 ? '#22c55e' : '#ef4444',
                                    marginBottom: '3px',
                                }}
                            >
                                Response Body:
                            </div>
                            <SyntaxHighlight
                                json={JSON.stringify(row.res.body, null, 2)}
                                theme={theme}
                                searchText={searchText}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function isDarkMode(theme: ThemeConfig): boolean {
    return theme.mode === 'dark';
}

function JSONCell({row}: {row: LogEntry}): React.ReactElement {
    const {theme, searchText} = useContext(ViewerContext);
    const expandedRows = React.useContext(ExpandedRowsContext);
    const isExpanded = expandedRows?.has(row.id) ?? false;

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
                    minHeight: '28px',
                }}
                title={jsonString}
            >
                {JSON.stringify(row)}
            </div>
        );
    }

    // Expanded view with syntax highlighting
    return (
        <div
            style={{
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                padding: '8px 0',
            }}
        >
            <SyntaxHighlight
                json={jsonString}
                theme={theme}
                searchText={searchText}
            />
        </div>
    );
}

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
                minHeight: '28px',
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

/**
 * Tokenizes JSON and wraps each token with appropriate color from theme.syntax.
 * Also applies search highlighting to matching tokens.
 */
function SyntaxHighlight({
    json,
    theme,
    searchText = '',
}: {
    json: string;
    theme: ThemeConfig;
    searchText?: string;
}): React.ReactElement {
    const tokens: React.ReactNode[] = [];
    const syntax = theme.syntax ?? {};

    // Simple JSON tokenizer using regex
    const pattern = /"(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\]:,]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(json)) !== null) {
        // Add any whitespace before this token
        if (match.index > lastIndex) {
            const whitespace = json.substring(lastIndex, match.index);
            tokens.push(searchText ? highlightSearch(whitespace, searchText) : whitespace);
        }

        const token = match[0];
        let color: string | undefined;

        if (token === 'true' || token === 'false') {
            color = syntax.boolean;
        } else if (token === 'null') {
            color = syntax.null;
        } else if (token[0] === '"') {
            // Check if this is a key by looking ahead for a colon
            const afterToken = json.substring(pattern.lastIndex).trimStart();
            if (afterToken[0] === ':') {
                color = syntax.key;
            } else {
                color = syntax.string;
            }
        } else if (!isNaN(Number(token)) && token !== '') {
            color = syntax.number;
        } else if (/[{}[\]:,]/.test(token)) {
            color = syntax.punctuation;
        }

        const tokenContent = searchText ? highlightSearch(token, searchText) : token;

        tokens.push(
            color ? (
                <span
                    key={lastIndex}
                    style={{color}}
                >
                    {tokenContent}
                </span>
            ) : (
                tokenContent
            ),
        );

        lastIndex = pattern.lastIndex;
    }

    // Add any remaining text
    if (lastIndex < json.length) {
        const remaining = json.substring(lastIndex);
        tokens.push(searchText ? highlightSearch(remaining, searchText) : remaining);
    }

    return <>{tokens}</>;
}

// ── Entry Detail Modal ────────────────────────────────────────────────────────

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
    const {theme, searchText} = useContext(ViewerContext);
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
                            {entry.req.body && (
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
                            {entry.res.body && (
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
    /** Initial set of expanded row IDs (for Storybook demos) */
    initialExpandedRows?: Set<string>;
}

export function LogViewer({
    config: configProp,
    theme: themeProp,
    initialSearchText = '',
    initialExpandedRows,
}: LogViewerProps): React.ReactElement {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
    const [connected, setConnected] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({});
    const [searchText, setSearchText] = useState(initialSearchText);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(initialExpandedRows ?? new Set());
    const [autoScroll, setAutoScroll] = useState(true);
    const [timeMode, setTimeMode] = useState<'absolute' | 'relative'>('absolute');
    const wsRef = useRef<WebSocket | null>(null);
    const gridApiRef = useRef<any>(null);
    const lastIdRef = useRef<string>('');
    const entriesRef = useRef<LogEntry[]>([]);
    const filtersRef = useRef<FilterOptions>({});

    // Track unique service names for autocomplete
    const uniqueServiceNames = useMemo(() => {
        const names = new Set<string>();
        entries.forEach(e => {
            if (e.name) names.add(e.name);
        });
        return Array.from(names).sort();
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
    }, [clientConfig]); // eslint-disable-line react-hooks/exhaustive-deps

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
            result = result.filter(e => e.traceId === filters.traceId);
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

        // Apply service name filter
        if (filters.name) {
            result = result.filter(e => e.name === filters.name);
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
                cell: ({row}: {row: LogEntry}) => (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            minHeight: '28px',
                            fontSize: '12px',
                            cursor: 'pointer',
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            setTimeMode(m => (m === 'absolute' ? 'relative' : 'absolute'));
                        }}
                        title="Click to toggle"
                    >
                        {timeMode === 'absolute' ? formatTimestamp(row.time) : timeAgo(row.time)}
                    </div>
                ),
            },
            {
                id: 'level',
                header: 'Level',
                width: 75,
                cell: LevelCell,
            },
            {
                id: 'name',
                header: 'Service',
                width: 130,
                cell: NameCell,
            },
            {
                id: 'traceId',
                header: 'Trace ID',
                width: 155,
                cell: TraceLinkCell,
            },
            {
                id: 'msg',
                header: 'Message',
                width: 400,
                resizable: true,
                cell: MessageCell,
            },
            {
                id: 'json',
                header: 'JSON',
                width: 400,
                resizable: true,
                cell: JSONCell,
            },
        ],
        [timeMode],
    );

    // ── Grid init (stable ref to avoid re-initialization) ─────────────────

    const initGrid = useCallback(
        (api: any) => {
            gridApiRef.current = api;
            api.on('select-row', (ev: {id: string}) => {
                // Toggle expanded state instead of showing modal
                setExpandedRows(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(ev.id)) {
                        newSet.delete(ev.id);
                    } else {
                        newSet.add(ev.id);
                    }
                    return newSet;
                });
                // Trigger grid resize to recalculate row heights
                setTimeout(() => {
                    if (api.exec) api.exec('resize');
                }, 0);
            });
        },
        [], // eslint-disable-line react-hooks/exhaustive-deps
    );

    // ── Row height calculation ────────────────────────────────────────────

    const getRowHeight = useCallback(
        (row: LogEntry): number => {
            if (expandedRows.has(row.id)) {
                // Calculate approximate height for expanded row
                let height = 0;

                // Base message height
                if (row.msg) {
                    const lines = Math.ceil((row.msg.length || 80) / 80);
                    height += Math.max(lines * 20, 40);
                }

                // Error details
                if (row.err) {
                    height += 100;
                    if (row.err.stack) {
                        const stackLines = (row.err.stack.match(/\n/g) || []).length;
                        height += Math.min(stackLines * 16, 200);
                    }
                }

                // Request details
                if (row.req) height += 80;

                // Response details
                if (row.res) height += 60;

                return Math.max(height, 100);
            }
            return 28; // Default single-line height
        },
        [expandedRows],
    );

    // ── Row styling (highlight trace-filtered rows) ───────────────────────

    const rowStyle = useCallback(
        (row: LogEntry) => {
            if (filters.traceId && row.traceId === filters.traceId)
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

    // ── Context value ─────────────────────────────────────────────────────

    const contextValue = useMemo(
        () => ({theme, searchText, clientConfig, onTraceFilter: handleTraceFilter}),
        [theme, searchText, clientConfig, handleTraceFilter],
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
        filters.traceId ||
        filters.search ||
        filters.hasError ||
        (filters.properties && Object.keys(filters.properties).length > 0);
    const ThemeWrapper = isDark ? WillowDark : Willow;

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <ViewerContext.Provider value={contextValue}>
            <ExpandedRowsContext.Provider value={expandedRows}>
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
                            style={{...inputStyle, width: '140px'}}
                            placeholder="Service name..."
                            value={filters.name ?? ''}
                            onChange={handleNameChange}
                            list="service-names-datalist"
                        />

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
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase' as const,
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
                    <div style={{flex: 1, overflow: 'hidden'}}>
                        <ThemeWrapper>
                            <Grid
                                {...({
                                    data: displayEntries,
                                    columns,
                                    select: true,
                                    rowStyle,
                                    rowHeight: getRowHeight,
                                    autoRowHeight: true,
                                    init: initGrid,
                                    onFilterTrace: handleFilterTrace,
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
            </ExpandedRowsContext.Provider>
        </ViewerContext.Provider>
    );
}

export default LogViewer;
