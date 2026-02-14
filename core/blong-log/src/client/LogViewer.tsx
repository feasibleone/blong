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
        part.toLowerCase() === search.toLowerCase()
            ? React.createElement(
                  'mark',
                  {
                      key: i,
                      style: {
                          background: '#e3b341',
                          color: '#000',
                          padding: '0 1px',
                          borderRadius: '2px',
                      },
                  },
                  part,
              )
            : part,
    );
}

// ── SVAR Grid Cell Components ─────────────────────────────────────────────────

function LevelCell({row}: {row: LogEntry}): React.ReactElement {
    const {theme} = useContext(ViewerContext);
    const name = row.levelName ?? LEVEL_NAME[row.level ?? 30] ?? 'unknown';
    const colors = theme.levels ?? {};
    const color = (colors as Record<string, string>)[name] ?? '#6b7280';

    return React.createElement(
        'span',
        {
            style: {
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
            },
        },
        name,
    );
}

function NameCell({row}: {row: LogEntry}): React.ReactElement {
    const {searchText} = useContext(ViewerContext);
    return React.createElement(
        'div',
        {
            style: {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '12px',
            },
            title: row.name ?? '',
        },
        highlightSearch(row.name ?? '', searchText),
    );
}

function TraceLinkCell({
    row,
    onAction,
}: {
    row: LogEntry;
    onAction: (ev: {action?: string; data?: Record<string, unknown>}) => void;
}): React.ReactElement | null {
    const {clientConfig} = useContext(ViewerContext);

    if (!row.traceId) return null;

    const handleClick = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
            if (clientConfig?.traceUrlPattern) {
                const start = row.time ? (row.time as number) - 60000 : Date.now() - 3600000;
                const end = row.time ? (row.time as number) + 60000 : Date.now();
                const url = clientConfig.traceUrlPattern
                    .replace('{traceId}', row.traceId!)
                    .replace('{startTime}', String(start))
                    .replace('{endTime}', String(end));
                window.open(url, '_blank');
            }
        } else {
            onAction({action: 'filter-trace', data: {traceId: row.traceId}});
        }
    };

    return React.createElement(
        'span',
        {
            style: {
                cursor: 'pointer',
                color: '#58a6ff',
                textDecoration: 'underline',
                fontSize: '12px',
            },
            onClick: handleClick,
            title: 'Click to filter, Ctrl+Click to open trace view',
        },
        row.traceId.substring(0, 16) + '\u2026',
    );
}

function MessageCell({row}: {row: LogEntry}): React.ReactElement {
    const {searchText, theme} = useContext(ViewerContext);
    
    // Try to parse message as JSON
    let messageContent: React.ReactNode = row.msg ?? '';
    if (row.msg) {
        try {
            JSON.parse(row.msg);
            // If it's valid JSON, use syntax highlighting
            messageContent = React.createElement(SyntaxHighlight, {json: row.msg, theme});
        } catch {
            // Not JSON, use regular highlight with search
            messageContent = highlightSearch(row.msg, searchText);
        }
    }
    
    return React.createElement(
        'div',
        {
            style: {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '12px',
            },
            title: row.msg ?? '',
        },
        messageContent,
        row.err
            ? React.createElement(
                  'span',
                  {style: {color: theme.levels?.error ?? '#ef4444', marginLeft: '8px'}},
                  ` [${row.err.type ?? 'Error'}: ${row.err.message ?? ''}]`,
              )
            : null,
    );
}

function HttpCell({row}: {row: LogEntry}): React.ReactElement {
    const statusColor = row.res
        ? (row.res.statusCode ?? 200) < 400
            ? '#22c55e'
            : '#ef4444'
        : undefined;
    return React.createElement(
        'div',
        {style: {display: 'flex', gap: '8px', fontSize: '12px'}},
        row.req
            ? React.createElement(
                  'span',
                  {title: JSON.stringify(row.req, null, 2)},
                  `${row.req.method ?? 'GET'} ${row.req.url ?? ''}`,
              )
            : null,
        row.res
            ? React.createElement(
                  'span',
                  {title: JSON.stringify(row.res, null, 2)},
                  React.createElement(
                      'span',
                      {style: {color: statusColor, fontWeight: 'bold'}},
                      String(row.res.statusCode ?? ''),
                  ),
                  row.res.responseTime ? ` ${row.res.responseTime}ms` : '',
              )
            : null,
    );
}

// ── JSON Syntax Highlighting ──────────────────────────────────────────────────

/**
 * Tokenizes JSON and wraps each token with appropriate color from theme.syntax
 */
function SyntaxHighlight({
    json,
    theme,
}: {
    json: string;
    theme: ThemeConfig;
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
            tokens.push(json.substring(lastIndex, match.index));
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
        }
        
        tokens.push(
            color
                ? React.createElement('span', {key: lastIndex, style: {color}}, token)
                : token,
        );
        
        lastIndex = pattern.lastIndex;
    }
    
    // Add any remaining text
    if (lastIndex < json.length) {
        tokens.push(json.substring(lastIndex));
    }
    
    return React.createElement(React.Fragment, null, ...tokens);
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
    const {theme} = useContext(ViewerContext);
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

    return React.createElement(
        'div',
        {
            style: {
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
            } as CSSProperties,
            onClick: onClose,
        },
        React.createElement(
            'div',
            {
                style: {
                    background: isDark ? '#161b22' : '#ffffff',
                    border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    maxWidth: '80vw',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    minWidth: '600px',
                },
                onClick: (e: React.MouseEvent) => e.stopPropagation(),
            },
            React.createElement(
                'div',
                {style: {display: 'flex', justifyContent: 'space-between', marginBottom: '12px'}},
                React.createElement(
                    'h3',
                    {style: {fontSize: '14px', fontWeight: 'bold'}},
                    'Log Entry Details',
                ),
                React.createElement(
                    'div',
                    {style: {display: 'flex', gap: '8px', alignItems: 'center'}},
                    React.createElement(
                        'label',
                        {style: {fontSize: '12px', cursor: 'pointer'}},
                        React.createElement('input', {
                            type: 'checkbox',
                            checked: wrapText,
                            onChange: () => setWrapText(w => !w),
                            style: {marginRight: '4px'},
                        }),
                        'Wrap text',
                    ),
                    React.createElement(
                        'button',
                        {
                            onClick: onClose,
                            style: {
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: '18px',
                            },
                        },
                        '\u00d7',
                    ),
                ),
            ),
            // Exception section
            entry.err
                ? React.createElement(
                      'div',
                      null,
                      React.createElement('div', {style: sectionHeaderStyle}, 'Exception'),
                      React.createElement(
                          'div',
                          {style: sectionStyle},
                          React.createElement(
                              'div',
                              {
                                  style: {
                                      color: theme.levels?.error ?? '#ef4444',
                                      fontWeight: 'bold',
                                      marginBottom: '8px',
                                  },
                              },
                              `${entry.err.type ?? 'Error'}: ${entry.err.message ?? 'No message'}`,
                          ),
                          entry.err.stack
                              ? React.createElement(
                                    'div',
                                    {style: {whiteSpace: 'pre-wrap', lineHeight: '1.5'}},
                                    entry.err.stack,
                                )
                              : null,
                      ),
                  )
                : null,
            // HTTP Request section
            entry.req
                ? React.createElement(
                      'div',
                      null,
                      React.createElement('div', {style: sectionHeaderStyle}, 'HTTP Request'),
                      React.createElement(
                          'div',
                          {style: sectionStyle},
                          React.createElement(
                              'div',
                              {style: {fontWeight: 'bold', marginBottom: '8px'}},
                              `${entry.req.method ?? 'GET'} ${entry.req.url ?? ''}`,
                          ),
                          entry.req.headers
                              ? React.createElement(
                                    'div',
                                    null,
                                    React.createElement(
                                        'div',
                                        {style: {fontWeight: 'bold', marginTop: '8px', marginBottom: '4px'}},
                                        'Headers:',
                                    ),
                                    React.createElement(
                                        'table',
                                        {style: {width: '100%', fontSize: '11px'}},
                                        React.createElement(
                                            'tbody',
                                            null,
                                            ...Object.entries(entry.req.headers).map(([key, value]) =>
                                                React.createElement(
                                                    'tr',
                                                    {key},
                                                    React.createElement(
                                                        'td',
                                                        {
                                                            style: {
                                                                padding: '2px 8px 2px 0',
                                                                verticalAlign: 'top',
                                                                color: isDark ? '#79c0ff' : '#0969da',
                                                            },
                                                        },
                                                        key,
                                                    ),
                                                    React.createElement(
                                                        'td',
                                                        {style: {padding: '2px 0', verticalAlign: 'top'}},
                                                        value,
                                                    ),
                                                ),
                                            ),
                                        ),
                                    ),
                                )
                              : null,
                          entry.req.body
                              ? React.createElement(
                                    'div',
                                    null,
                                    React.createElement(
                                        'div',
                                        {style: {fontWeight: 'bold', marginTop: '8px', marginBottom: '4px'}},
                                        'Body:',
                                    ),
                                    React.createElement(
                                        'pre',
                                        {style: {margin: 0, whiteSpace: 'pre-wrap'}},
                                        typeof entry.req.body === 'string'
                                            ? entry.req.body
                                            : React.createElement(SyntaxHighlight, {
                                                  json: JSON.stringify(entry.req.body, null, 2),
                                                  theme,
                                              }),
                                    ),
                                )
                              : null,
                      ),
                  )
                : null,
            // HTTP Response section
            entry.res
                ? React.createElement(
                      'div',
                      null,
                      React.createElement('div', {style: sectionHeaderStyle}, 'HTTP Response'),
                      React.createElement(
                          'div',
                          {style: sectionStyle},
                          React.createElement(
                              'div',
                              {style: {fontWeight: 'bold', marginBottom: '8px'}},
                              React.createElement(
                                  'span',
                                  {
                                      style: {
                                          color:
                                              (entry.res.statusCode ?? 200) < 400 ? '#22c55e' : '#ef4444',
                                      },
                                  },
                                  entry.res.statusCode ?? 200,
                              ),
                              entry.res.responseTime ? ` (${entry.res.responseTime}ms)` : '',
                          ),
                          entry.res.headers
                              ? React.createElement(
                                    'div',
                                    null,
                                    React.createElement(
                                        'div',
                                        {style: {fontWeight: 'bold', marginTop: '8px', marginBottom: '4px'}},
                                        'Headers:',
                                    ),
                                    React.createElement(
                                        'table',
                                        {style: {width: '100%', fontSize: '11px'}},
                                        React.createElement(
                                            'tbody',
                                            null,
                                            ...Object.entries(entry.res.headers).map(([key, value]) =>
                                                React.createElement(
                                                    'tr',
                                                    {key},
                                                    React.createElement(
                                                        'td',
                                                        {
                                                            style: {
                                                                padding: '2px 8px 2px 0',
                                                                verticalAlign: 'top',
                                                                color: isDark ? '#79c0ff' : '#0969da',
                                                            },
                                                        },
                                                        key,
                                                    ),
                                                    React.createElement(
                                                        'td',
                                                        {style: {padding: '2px 0', verticalAlign: 'top'}},
                                                        value,
                                                    ),
                                                ),
                                            ),
                                        ),
                                    ),
                                )
                              : null,
                          entry.res.body
                              ? React.createElement(
                                    'div',
                                    null,
                                    React.createElement(
                                        'div',
                                        {style: {fontWeight: 'bold', marginTop: '8px', marginBottom: '4px'}},
                                        'Body:',
                                    ),
                                    React.createElement(
                                        'pre',
                                        {style: {margin: 0, whiteSpace: 'pre-wrap'}},
                                        typeof entry.res.body === 'string'
                                            ? entry.res.body
                                            : React.createElement(SyntaxHighlight, {
                                                  json: JSON.stringify(entry.res.body, null, 2),
                                                  theme,
                                              }),
                                    ),
                                )
                              : null,
                      ),
                  )
                : null,
            // Raw JSON section
            React.createElement('div', {style: sectionHeaderStyle}, 'Raw Entry'),
            React.createElement(
                'pre',
                {
                    style: {
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
                    },
                },
                React.createElement(SyntaxHighlight, {json: jsonString, theme}),
            ),
        ),
    );
}

// ── Main LogViewer Component ──────────────────────────────────────────────────

export interface LogViewerProps {
    /** Server config URL or direct config object */
    config?: string | ClientConfig;
    /** Override theme */
    theme?: ThemeConfig;
}

export function LogViewer({
    config: configProp,
    theme: themeProp,
}: LogViewerProps): React.ReactElement {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
    const [connected, setConnected] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({});
    const [searchText, setSearchText] = useState('');
    const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const wsRef = useRef<WebSocket | null>(null);
    const gridApiRef = useRef<any>(null);
    const lastIdRef = useRef<string>('');
    const entriesRef = useRef<LogEntry[]>([]);

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

    // Keep entries ref current for use in stable callbacks
    entriesRef.current = entries;

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
                const msg: WsMessage = {type: 'subscribe', filters};
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

    useEffect(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const msg: WsMessage = {type: 'subscribe', filters};
            wsRef.current.send(JSON.stringify(msg));
            setEntries([]);
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

    const handleCustomPropertyChange = useCallback(
        (propName: string, value: string): void => {
            setFilters(f => ({
                ...f,
                properties: value
                    ? {...(f.properties ?? {}), [propName]: value}
                    : (() => {
                          const {[propName]: _, ...rest} = f.properties ?? {};
                          return Object.keys(rest).length > 0 ? rest : undefined;
                      })(),
            }));
        },
        [],
    );

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
        if (!searchText) return entries;
        const search = searchText.toLowerCase();
        return entries.filter(e => JSON.stringify(e).toLowerCase().includes(search));
    }, [entries, searchText]);

    // ── Grid columns ──────────────────────────────────────────────────────

    const columns = useMemo(
        () => [
            {
                id: 'time',
                header: 'Time',
                width: 105,
                template: (_v: unknown, row: LogEntry) => formatTimestamp(row.time),
            },
            {
                id: 'timeAgo',
                header: 'Ago',
                width: 65,
                getter: (row: LogEntry) => row.time,
                template: (v: unknown) => timeAgo(v as number),
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
                flexgrow: 1,
                cell: MessageCell,
            },
            {
                id: 'http',
                header: 'HTTP',
                width: 200,
                getter: (row: LogEntry) => (row.req ? `${row.req.method} ${row.req.url}` : ''),
                cell: HttpCell,
            },
        ],
        [],
    );

    // ── Grid init (stable ref to avoid re-initialization) ─────────────────

    const initGrid = useCallback(
        (api: any) => {
            gridApiRef.current = api;
            api.on('select-row', (ev: {id: string}) => {
                const entry = entriesRef.current.find(e => e.id === ev.id);
                if (entry) setSelectedEntry(entry);
            });
        },
        [], // eslint-disable-line react-hooks/exhaustive-deps
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

    return React.createElement(
        ViewerContext.Provider,
        {value: contextValue},
        React.createElement(
            'div',
            {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    background: isDark ? '#0d1117' : '#ffffff',
                    color: isDark ? '#c9d1d9' : '#24292f',
                },
            },
            // Dynamic styles for trace highlight
            React.createElement(
                'style',
                null,
                '.blong-log-trace-highlight:not(.selected) .cell { background: ' +
                    (isDark ? '#1c2128' : '#ddf4ff') +
                    ' !important; }',
            ),
            // Toolbar
            React.createElement(
                'div',
                {style: toolbarStyle},
                React.createElement(
                    'select',
                    {style: selectStyle, value: filters.level ?? '', onChange: handleLevelChange},
                    React.createElement('option', {value: ''}, 'All Levels'),
                    ...['trace', 'debug', 'info', 'warn', 'error', 'fatal'].map(l =>
                        React.createElement('option', {key: l, value: l}, l.toUpperCase()),
                    ),
                ),
                React.createElement('input', {
                    style: {...inputStyle, width: '140px'},
                    placeholder: 'Service name...',
                    value: filters.name ?? '',
                    onChange: handleNameChange,
                    list: 'service-names-datalist',
                }),
                // Datalist for service name autocomplete
                React.createElement(
                    'datalist',
                    {id: 'service-names-datalist'},
                    ...uniqueServiceNames.map(name =>
                        React.createElement('option', {key: name, value: name}),
                    ),
                ),
                React.createElement(
                    'label',
                    {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            userSelect: 'none' as const,
                        },
                    },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: !!filters.hasError,
                        onChange: handleHasErrorChange,
                    }),
                    'Has Error',
                ),
                // Dynamic custom property filters
                ...(clientConfig?.properties.custom
                    ? clientConfig.properties.custom
                          .filter(p => p.filterable)
                          .map(prop =>
                              prop.values
                                  ? // Dropdown for predefined values
                                    React.createElement(
                                        'select',
                                        {
                                            key: prop.name,
                                            style: selectStyle,
                                            value: filters.properties?.[prop.name] ?? '',
                                            onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                                                handleCustomPropertyChange(prop.name, e.target.value),
                                        },
                                        React.createElement(
                                            'option',
                                            {value: ''},
                                            `All ${prop.label}`,
                                        ),
                                        ...prop.values.map(val =>
                                            React.createElement(
                                                'option',
                                                {key: val, value: val},
                                                val,
                                            ),
                                        ),
                                    )
                                  : // Text input for free-form values
                                    React.createElement('input', {
                                        key: prop.name,
                                        style: {...inputStyle, width: '140px'},
                                        placeholder: `${prop.label}...`,
                                        value: filters.properties?.[prop.name] ?? '',
                                        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                                            handleCustomPropertyChange(prop.name, e.target.value),
                                    }),
                          )
                    : []),
                filters.traceId
                    ? React.createElement(
                          'span',
                          {
                              style: {
                                  padding: '1px 6px',
                                  borderRadius: '3px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  textTransform: 'uppercase' as const,
                                  background: '#1f6feb',
                                  color: '#fff',
                                  cursor: 'pointer',
                              },
                              onClick: () => handleTraceFilter(filters.traceId!),
                              title: 'Click to remove trace filter',
                          },
                          'Trace: ' + filters.traceId.substring(0, 12) + '\u2026 \u00d7',
                      )
                    : null,
                React.createElement('input', {
                    style: {...inputStyle, flex: 1, minWidth: '200px'},
                    placeholder: 'Search logs... (Enter to apply)',
                    value: searchText,
                    onChange: handleSearchChange,
                    onKeyDown: handleSearchSubmit,
                }),
                hasFilters
                    ? React.createElement(
                          'button',
                          {
                              style: {
                                  ...inputStyle,
                                  cursor: 'pointer',
                                  border: '1px solid #da3633',
                                  color: '#da3633',
                              },
                              onClick: clearFilters,
                          },
                          'Clear',
                      )
                    : null,
            ),
            // SVAR Grid
            React.createElement(
                'div',
                {style: {flex: 1, overflow: 'hidden'}},
                React.createElement(
                    ThemeWrapper,
                    null,
                    React.createElement(Grid, {
                        data: displayEntries,
                        columns,
                        select: true,
                        rowStyle,
                        init: initGrid,
                        onFilterTrace: handleFilterTrace,
                        sizes: {rowHeight: 28},
                    } as any),
                ),
            ),
            // Status bar
            React.createElement(
                'div',
                {style: statusBarStyle},
                React.createElement('span', {
                    style: {
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        display: 'inline-block',
                        background: connected ? '#22c55e' : '#ef4444',
                    },
                }),
                React.createElement('span', null, connected ? 'Connected' : 'Disconnected'),
                React.createElement('span', null, displayEntries.length + ' entries'),
                React.createElement(
                    'span',
                    {
                        style: {cursor: 'pointer'},
                        onClick: () => setAutoScroll(a => !a),
                        title: 'Toggle auto-scroll',
                    },
                    autoScroll ? '\u2b07 Auto-scroll' : '\u23f8 Paused',
                ),
            ),
            // Detail modal
            selectedEntry
                ? React.createElement(EntryModal, {
                      entry: selectedEntry,
                      isDark,
                      onClose: () => setSelectedEntry(null),
                  })
                : null,
        ),
    );
}

export default LogViewer;
