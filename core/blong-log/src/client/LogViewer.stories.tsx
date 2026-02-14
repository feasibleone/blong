/**
 * Storybook stories for the LogViewer component.
 *
 * These stories render the LogViewer with mock data (no WebSocket connection)
 * to test visual appearance across themes, data volumes, and UI states.
 */

import React, {useMemo, useState} from 'react';

import type {Meta, StoryObj} from '@storybook/react';
import {Grid, Willow, WillowDark} from '@svar-ui/react-grid';

import type {ClientConfig, LogEntry, ThemeConfig} from '../types.js';
import {LEVEL_NAME} from '../types.js';
import {
    darkThemeConfig,
    errorEntries,
    generateLargeDataset,
    lightThemeConfig,
    sampleEntries,
    TRACE_ID_A,
} from './__fixtures__/data.js';

// Generate deterministic IDs for story entries
function makeId(index: number): string {
    const hex = index.toString(16).padStart(10, '0').toUpperCase();
    return `01ARYZ6S41${hex}${hex.substring(0, 16).padStart(16, '0')}`;
}

const BASE_TIME = new Date('2026-02-13T12:00:00.000Z').getTime();

// ── Standalone wrapper that renders LogViewer grid without WebSocket ───────────

/**
 * A self-contained version of the LogViewer grid area for stories.
 * It takes entries and config directly — no WebSocket needed.
 */
function StoryViewer({
    entries,
    config,
    theme: themeProp,
    connectedOverride = false,
    filterLevel,
    filterName,
    filterTraceId,
    searchText: initialSearch = '',
}: {
    entries: LogEntry[];
    config: ClientConfig;
    theme?: ThemeConfig;
    connectedOverride?: boolean;
    filterLevel?: string;
    filterName?: string;
    filterTraceId?: string;
    searchText?: string;
}) {
    const theme = useMemo(() => ({...config.theme, ...themeProp}), [config.theme, themeProp]);
    const isDark = theme.mode === 'dark';
    const [searchText, setSearchText] = useState(initialSearch);
    const [filterState, setFilterState] = useState({
        level: filterLevel,
        name: filterName,
        traceId: filterTraceId,
    });
    const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);

    const ThemeWrapper = isDark ? WillowDark : Willow;

    // Client-side filtering
    const displayEntries = useMemo(() => {
        let filtered = entries;
        if (filterState.level) {
            const levelMap: Record<string, number> = {
                trace: 10,
                debug: 20,
                info: 30,
                warn: 40,
                error: 50,
                fatal: 60,
            };
            const minLevel = levelMap[filterState.level] ?? 0;
            filtered = filtered.filter(e => (e.level ?? 0) >= minLevel);
        }
        if (filterState.name) {
            const name = filterState.name.toLowerCase();
            filtered = filtered.filter(e => (e.name ?? '').toLowerCase().includes(name));
        }
        if (filterState.traceId) {
            filtered = filtered.filter(e => e.traceId === filterState.traceId);
        }
        if (searchText) {
            const s = searchText.toLowerCase();
            filtered = filtered.filter(e => JSON.stringify(e).toLowerCase().includes(s));
        }
        return filtered;
    }, [entries, filterState, searchText]);

    const columns = useMemo(
        () => [
            {
                id: 'time',
                header: 'Time',
                width: 105,
                template: (_v: unknown, row: LogEntry) => {
                    if (!row.time) return '';
                    return new Date(row.time).toLocaleTimeString('en-US', {
                        hour12: false,
                        fractionalSecondDigits: 3,
                    });
                },
            },
            {
                id: 'level',
                header: 'Level',
                width: 75,
                cell: function LevelCell({row}: {row: LogEntry}) {
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
                                textTransform: 'uppercase' as const,
                                color: '#fff',
                                background: color,
                                display: 'inline-block',
                                minWidth: '45px',
                                textAlign: 'center' as const,
                            },
                        },
                        name,
                    );
                },
            },
            {
                id: 'name',
                header: 'Service',
                width: 130,
                template: (_v: unknown, row: LogEntry) => row.name ?? '',
            },
            {
                id: 'traceId',
                header: 'Trace ID',
                width: 155,
                template: (_v: unknown, row: LogEntry) =>
                    row.traceId ? row.traceId.substring(0, 16) + '\u2026' : '',
            },
            {
                id: 'msg',
                header: 'Message',
                flexgrow: 1,
                cell: function MsgCell({row}: {row: LogEntry}) {
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
                        row.msg ?? '',
                        row.err
                            ? React.createElement(
                                  'span',
                                  {
                                      style: {
                                          color: theme.levels?.error ?? '#ef4444',
                                          marginLeft: '8px',
                                      },
                                  },
                                  ` [${row.err.type ?? 'Error'}: ${row.err.message ?? ''}]`,
                              )
                            : null,
                    );
                },
            },
            {
                id: 'http',
                header: 'HTTP',
                width: 200,
                getter: (row: LogEntry) => (row.req ? `${row.req.method} ${row.req.url}` : ''),
                cell: function HttpCell({row}: {row: LogEntry}) {
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
                                  null,
                                  `${row.req.method ?? 'GET'} ${row.req.url ?? ''}`,
                              )
                            : null,
                        row.res
                            ? React.createElement(
                                  'span',
                                  null,
                                  React.createElement(
                                      'span',
                                      {style: {color: statusColor, fontWeight: 'bold'}},
                                      String(row.res.statusCode ?? ''),
                                  ),
                                  row.res.responseTime ? ` ${row.res.responseTime}ms` : '',
                              )
                            : null,
                    );
                },
            },
        ],
        [theme],
    );

    const initGrid = React.useCallback(
        (api: any) => {
            api.on('select-row', (ev: {id: string}) => {
                const entry = entries.find(e => e.id === ev.id);
                if (entry) setSelectedEntry(entry);
            });
        },
        [entries],
    );

    const rowStyle = React.useCallback(
        (row: LogEntry) => {
            if (filterState.traceId && row.traceId === filterState.traceId)
                return 'blong-log-trace-highlight';
            return '';
        },
        [filterState.traceId],
    );

    const inputStyle = {
        padding: '4px 8px',
        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        borderRadius: '4px',
        background: isDark ? '#0d1117' : '#ffffff',
        color: isDark ? '#c9d1d9' : '#24292f',
        fontSize: '12px',
        outline: 'none',
    };

    const selectStyle = {
        padding: '4px 8px',
        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        borderRadius: '4px',
        background: isDark ? '#0d1117' : '#ffffff',
        color: isDark ? '#c9d1d9' : '#24292f',
        fontSize: '12px',
    };

    return React.createElement(
        'div',
        {
            style: {
                display: 'flex',
                flexDirection: 'column' as const,
                height: '100vh',
                background: isDark ? '#0d1117' : '#ffffff',
                color: isDark ? '#c9d1d9' : '#24292f',
                fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
                fontSize: '13px',
            },
        },
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
            {
                style: {
                    display: 'flex',
                    gap: '8px',
                    padding: '8px 12px',
                    borderBottom: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                    background: isDark ? '#161b22' : '#f6f8fa',
                    alignItems: 'center',
                    flexWrap: 'wrap' as const,
                },
            },
            React.createElement(
                'select',
                {
                    style: selectStyle,
                    value: filterState.level ?? '',
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                        setFilterState(f => ({...f, level: e.target.value || undefined})),
                },
                React.createElement('option', {value: ''}, 'All Levels'),
                ...['trace', 'debug', 'info', 'warn', 'error', 'fatal'].map(l =>
                    React.createElement('option', {key: l, value: l}, l.toUpperCase()),
                ),
            ),
            React.createElement('input', {
                style: {...inputStyle, width: '140px'},
                placeholder: 'Service name...',
                value: filterState.name ?? '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setFilterState(f => ({...f, name: e.target.value || undefined})),
            }),
            filterState.traceId
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
                          onClick: () => setFilterState(f => ({...f, traceId: undefined})),
                      },
                      'Trace: ' + filterState.traceId.substring(0, 12) + '\u2026 \u00d7',
                  )
                : null,
            React.createElement('input', {
                style: {...inputStyle, flex: 1, minWidth: '200px'},
                placeholder: 'Search logs...',
                value: searchText,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value),
            }),
            filterState.level || filterState.name || filterState.traceId || searchText
                ? React.createElement(
                      'button',
                      {
                          style: {
                              ...inputStyle,
                              cursor: 'pointer',
                              border: '1px solid #da3633',
                              color: '#da3633',
                          },
                          onClick: () => {
                              setFilterState({
                                  level: undefined,
                                  name: undefined,
                                  traceId: undefined,
                              });
                              setSearchText('');
                          },
                      },
                      'Clear',
                  )
                : null,
        ),
        // Grid
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
                    sizes: {rowHeight: 28},
                } as any),
            ),
        ),
        // Status bar
        React.createElement(
            'div',
            {
                style: {
                    display: 'flex',
                    gap: '12px',
                    padding: '4px 12px',
                    borderTop: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
                    background: isDark ? '#161b22' : '#f6f8fa',
                    fontSize: '11px',
                    color: isDark ? '#8b949e' : '#57606a',
                    alignItems: 'center',
                },
            },
            React.createElement('span', {
                style: {
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    display: 'inline-block',
                    background: connectedOverride ? '#22c55e' : '#ef4444',
                },
            }),
            React.createElement('span', null, connectedOverride ? 'Connected' : 'Disconnected'),
            React.createElement('span', null, `${displayEntries.length} entries`),
        ),
        // Modal
        selectedEntry
            ? React.createElement(
                  'div',
                  {
                      style: {
                          position: 'fixed' as const,
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 100,
                      },
                      onClick: () => setSelectedEntry(null),
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
                          {
                              style: {
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  marginBottom: '12px',
                              },
                          },
                          React.createElement(
                              'h3',
                              {style: {fontSize: '14px', fontWeight: 'bold'}},
                              'Log Entry Details',
                          ),
                          React.createElement(
                              'button',
                              {
                                  onClick: () => setSelectedEntry(null),
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
                      React.createElement(
                          'pre',
                          {
                              style: {
                                  whiteSpace: 'pre-wrap',
                                  fontFamily: 'inherit',
                                  fontSize: '12px',
                                  overflow: 'auto',
                                  maxHeight: '65vh',
                              },
                          },
                          JSON.stringify(selectedEntry, null, 2),
                      ),
                  ),
              )
            : null,
    );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof StoryViewer> = {
    title: 'LogViewer',
    component: StoryViewer,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof StoryViewer>;

// ── Stories ───────────────────────────────────────────────────────────────────

/** Default dark theme with a mix of log levels, HTTP info and errors */
export const DarkTheme: Story = {
    args: {
        entries: sampleEntries,
        config: darkThemeConfig,
        connectedOverride: true,
    },
};

/** Light theme variant */
export const LightTheme: Story = {
    args: {
        entries: sampleEntries,
        config: lightThemeConfig,
        connectedOverride: true,
    },
};

/** Viewer in disconnected state with no entries */
export const Empty: Story = {
    args: {
        entries: [],
        config: darkThemeConfig,
        connectedOverride: false,
    },
};

/** Only error-level entries displayed */
export const ErrorsOnly: Story = {
    args: {
        entries: errorEntries,
        config: darkThemeConfig,
        connectedOverride: true,
    },
};

/** Entries filtered to a single distributed trace */
export const TraceFiltered: Story = {
    args: {
        entries: sampleEntries,
        config: darkThemeConfig,
        connectedOverride: true,
        filterTraceId: TRACE_ID_A,
    },
};

/** Pre-filtered by service name */
export const ServiceFiltered: Story = {
    args: {
        entries: sampleEntries,
        config: darkThemeConfig,
        connectedOverride: true,
        filterName: 'payment',
    },
};

/** Pre-filtered by minimum level */
export const LevelFiltered: Story = {
    args: {
        entries: sampleEntries,
        config: darkThemeConfig,
        connectedOverride: true,
        filterLevel: 'warn',
    },
};

/** Search text pre-applied */
export const WithSearch: Story = {
    args: {
        entries: sampleEntries,
        config: darkThemeConfig,
        connectedOverride: true,
        searchText: 'transfer',
    },
};

/** 500 entries to verify grid performance at scale */
export const LargeDataset: Story = {
    args: {
        entries: generateLargeDataset(500),
        config: darkThemeConfig,
        connectedOverride: true,
    },
};

/** Large dataset in light theme */
export const LargeDatasetLight: Story = {
    args: {
        entries: generateLargeDataset(500),
        config: lightThemeConfig,
        connectedOverride: true,
    },
};

/** Entries with HTTP request/response details - showcases HTTP detail view in modal */
export const WithHTTPDetails: Story = {
    args: {
        entries: sampleEntries.filter(e => e.req || e.res),
        config: darkThemeConfig,
        connectedOverride: true,
    },
};

/** Entries with JSON messages - showcases JSON syntax highlighting */
export const WithJSONMessages: Story = {
    args: {
        entries: [
            {
                id: makeId(100),
                time: BASE_TIME,
                level: 30,
                levelName: 'info',
                name: 'api',
                msg: JSON.stringify({userId: 123, action: 'login', timestamp: BASE_TIME}),
            },
            {
                id: makeId(101),
                time: BASE_TIME + 100,
                level: 30,
                levelName: 'info',
                name: 'api',
                msg: JSON.stringify({
                    data: {nested: true, values: [1, 2, 3], flag: false},
                    count: 42,
                }),
            },
        ],
        config: darkThemeConfig,
        connectedOverride: true,
    },
};
