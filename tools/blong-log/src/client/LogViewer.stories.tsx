/**
 * Storybook stories for the LogViewer component.
 *
 * These stories render the real LogViewer component with mocked WebSocket data.
 * The MockedLogViewer wrapper provides static data to the actual component.
 */

import React from 'react';

import type {Meta, StoryObj} from '@storybook/react-vite';

import type {ClientConfig, LogEntry} from '../types.js';
import {
    darkThemeConfig,
    errorEntries,
    generateLargeDataset,
    httpDetailedEntries,
    lightThemeConfig,
    sampleEntries,
    TRACE_ID_A,
} from './__fixtures__/data.js';
import LogViewer from './LogViewer.js';

const BASE_TIME = new Date('2026-03-02T21:31:10.000Z').getTime();
// ── Mock WebSocket for Storybook ──────────────────────────────────────────────

/**
 * Wrapper that provides the real LogViewer with mocked WebSocket data.
 * This allows us to test the actual component with static data in Storybook,
 * including all filtering and search widgets.
 */
function MockedLogViewer({
    config,
    initialEntries = [],
    initialSearchText,
    initialExpandedRows,
}: {
    config: ClientConfig;
    initialEntries?: LogEntry[];
    initialSearchText?: string;
    initialExpandedRows?: Set<string>;
}): React.ReactElement {
    const mockWsUrl = React.useMemo(() => `ws://storybook-mock-${Math.random()}.local`, []);

    React.useEffect(() => {
        // Store original WebSocket
        const OriginalWebSocket = window.WebSocket;
        const winRecord = window as unknown as Record<string, unknown>;

        // Create mock WebSocket class
        class MockWebSocket {
            url: string;
            onopen: ((ev: Event) => void) | null = null;
            onmessage: ((ev: MessageEvent) => void) | null = null;
            onclose: ((ev: CloseEvent) => void) | null = null;
            onerror: ((ev: Event) => void) | null = null;
            readyState = 1; // OPEN
            OPEN = 1;
            CLOSED = 3;

            constructor(url: string) {
                this.url = url;
                // Simulate async connection
                // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
                setTimeout(() => {
                    if (this.onopen) {
                        this.onopen(new Event('open'));
                    }
                    // Send initial entries after connection opens
                    if (this.onmessage && initialEntries.length > 0) {
                        this.onmessage(
                            new MessageEvent('message', {
                                data: JSON.stringify({
                                    type: 'entries',
                                    entries: initialEntries,
                                }),
                            }),
                        );
                    }
                }, 10);
            }

            send(_data: string): void {
                // Mock send - accept subscribe messages but do nothing
            }

            close(): void {
                this.readyState = this.CLOSED;
                // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
                setTimeout(() => {
                    if (this.onclose) {
                        this.onclose(new CloseEvent('close'));
                    }
                }, 10);
            }
        }

        // Replace WebSocket for our mock URL only
        winRecord.WebSocket = function (url: string, protocols?: string | string[]) {
            if (url === mockWsUrl) {
                return new MockWebSocket(url);
            }
            return new OriginalWebSocket(url, protocols);
        };
        // Copy static properties
        (winRecord.WebSocket as Record<string, number>).CONNECTING = 0;
        (winRecord.WebSocket as Record<string, number>).OPEN = 1;
        (winRecord.WebSocket as Record<string, number>).CLOSING = 2;
        (winRecord.WebSocket as Record<string, number>).CLOSED = 3;

        // Cleanup: restore original WebSocket
        return () => {
            winRecord.WebSocket = OriginalWebSocket;
        };
    }, [mockWsUrl, initialEntries]);

    const configWithMockWs = React.useMemo(
        () => ({
            ...config,
            wsUrl: mockWsUrl,
        }),
        [config, mockWsUrl],
    );

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
            }}
        >
            <LogViewer
                config={configWithMockWs}
                initialSearchText={initialSearchText}
                initialExpandedRows={initialExpandedRows}
            />
        </div>
    );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof MockedLogViewer> = {
    title: 'LogViewer',
    component: MockedLogViewer,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MockedLogViewer>;

// ── Stories ───────────────────────────────────────────────────────────────────

/**
 * Default dark theme with a mix of log levels, HTTP info and errors.
 * Shows all filtering and search widgets in action.
 */
export const DarkTheme: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries,
    },
};

/**
 * Light theme variant with full filtering UI.
 */
export const LightTheme: Story = {
    args: {
        config: lightThemeConfig,
        initialEntries: sampleEntries,
    },
};

/**
 * Viewer in disconnected state with no entries.
 * Tests empty state UI.
 */
export const Empty: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [],
    },
};

/**
 * Only error-level entries displayed.
 * Use level filter dropdown to switch between levels.
 */
export const ErrorsOnly: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: errorEntries,
    },
};

/**
 * Large dataset with 500 entries to verify grid performance.
 * Tests scrolling and filtering with many entries.
 */
export const LargeDataset: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: generateLargeDataset(500),
    },
};

/**
 * Large dataset in light theme.
 */
export const LargeDatasetLight: Story = {
    args: {
        config: lightThemeConfig,
        initialEntries: generateLargeDataset(500),
    },
};

/**
 * Entries with HTTP request/response details.
 * Click on entries to see expanded view with HTTP details.
 */
export const WithHTTPDetails: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries.filter(e => e.req || e.res),
    },
};

/**
 * Mixed entries showcasing:
 * - Level filtering dropdown
 * - Service name filtering with autocomplete
 * - Search text input (type and press Enter)
 * - Trace ID filtering (click trace ID to filter)
 * - Has Error checkbox filter
 * - Clear button to reset all filters
 */
export const AllFiltersShowcase: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries,
    },
};

/**
 * Entries from a single service to show service filter.
 * Try typing in the service name filter.
 */
export const SingleService: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries.filter(e => e.name === 'payment'),
    },
};

/**
 * Entries with the same trace ID to demonstrate trace filtering.
 * Click on a trace ID link to filter by that trace.
 */
export const SingleTrace: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries.filter(e => e.traceId === TRACE_ID_A),
    },
};

// ── Expanded State Stories ────────────────────────────────────────────────────

/**
 * Demonstrates expanded view with HTTP request/response details.
 * Rows are automatically expanded to show full HTTP information including
 * request method, URL, headers, response status, and timing.
 */
export const ExpandedHTTPDetails: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries.filter(e => e.req || e.res).slice(0, 4),
        initialExpandedRows: new Set(
            sampleEntries
                .filter(e => e.req || e.res)
                .slice(0, 4)
                .map(e => e.id),
        ),
    },
};

/**
 * Demonstrates expanded view with exception/error details.
 * Shows full error messages, error types, and stack traces when available.
 * Highlights how errors are displayed with color-coded borders and formatting.
 */
export const ExpandedExceptionDetails: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [
            sampleEntries[4], // Transfer error with TransferError
            sampleEntries[6], // Fatal error with stack trace
            sampleEntries[11], // Auth error with JWTError
        ],
        initialExpandedRows: new Set([
            sampleEntries[4].id,
            sampleEntries[6].id,
            sampleEntries[11].id,
        ]),
    },
};

/**
 * Demonstrates expanded view with mixed content: HTTP, errors, and regular messages.
 * Shows how different content types are rendered together in expanded mode.
 */
export const ExpandedMixedContent: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [
            sampleEntries[2], // Info with HTTP success
            sampleEntries[4], // Error with HTTP and exception
            sampleEntries[10], // Warn with slow HTTP response
        ],
        initialExpandedRows: new Set([
            sampleEntries[2].id,
            sampleEntries[4].id,
            sampleEntries[10].id,
        ]),
    },
};

// ── HTTP Headers and Body Stories ─────────────────────────────────────────────

/**
 * Demonstrates full HTTP request/response rendering with headers and body.
 * Shows how request headers, request body (JSON), response headers, and
 * response body are displayed in expanded mode with syntax highlighting.
 */
export const HTTPFullDetails: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: httpDetailedEntries,
        initialExpandedRows: new Set(httpDetailedEntries.map(e => e.id)),
    },
};

/**
 * Demonstrates successful HTTP request with detailed headers and JSON body.
 * Shows coloured syntax highlighting for request and response JSON payloads.
 */
export const HTTPSuccessWithBody: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [httpDetailedEntries[0]], // Successful transfer
        initialExpandedRows: new Set([httpDetailedEntries[0].id]),
    },
};

/**
 * Demonstrates failed HTTP request with error body and validation details.
 * Shows how error responses are displayed with red borders and error payloads.
 */
export const HTTPErrorWithBody: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [httpDetailedEntries[1]], // Failed participant registration
        initialExpandedRows: new Set([httpDetailedEntries[1].id]),
    },
};

/**
 * Demonstrates HTTP GET request with response headers including caching and rate limits.
 * Shows common HTTP headers like ETag, Cache-Control, and X-Rate-Limit headers.
 */
export const HTTPWithCacheHeaders: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [httpDetailedEntries[2]], // Ledger account query
        initialExpandedRows: new Set([httpDetailedEntries[2].id]),
    },
};

// ── Search Highlighting Stories ───────────────────────────────────────────────

/**
 * Demonstrates search highlighting in single-line (collapsed) mode.
 * Shows how search terms are highlighted with yellow background in messages,
 * service names, and other text fields while rows remain collapsed.
 */
export const SearchHighlightingSingleLine: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: sampleEntries,
        initialSearchText: 'transfer',
    },
};

/**
 * Demonstrates search highlighting in expanded mode.
 * Shows how search terms are highlighted throughout expanded content including
 * error messages, HTTP URLs, and multi-line text.
 */
export const SearchHighlightingExpanded: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [
            sampleEntries[2], // Contains "POST" and "create"
            sampleEntries[4], // Contains "Transfer" and "payment"
            sampleEntries[9], // Contains "Agreement" and "create"
        ],
        initialSearchText: 'create',
        initialExpandedRows: new Set([
            sampleEntries[2].id,
            sampleEntries[4].id,
            sampleEntries[9].id,
        ]),
    },
};

/**
 * Demonstrates search highlighting with HTTP and error content.
 * Shows how search works across HTTP request/response details and error messages
 * when rows are expanded.
 */
export const SearchHighlightingHTTPAndErrors: Story = {
    args: {
        config: darkThemeConfig,
        initialEntries: [
            sampleEntries[4], // Error with "payment" and "Transfer"
            sampleEntries[6], // Fatal with "connection" and "pool"
            sampleEntries[11], // Error with "token" and "signature"
        ],
        initialSearchText: 'Error',
        initialExpandedRows: new Set([
            sampleEntries[4].id,
            sampleEntries[6].id,
            sampleEntries[11].id,
        ]),
    },
};

// ── Performance Testing Stories ───────────────────────────────────────────────

/**
 * Performance test: Simulates receiving 10 messages per second from WebSocket.
 * Sends 200 messages over 20 seconds to test real-time performance and rendering.
 * Watch for smooth scrolling, filtering, and search while messages stream in.
 */
function PerformanceTestStory(): React.ReactElement {
    const mockWsUrl = React.useMemo(() => `ws://storybook-mock-perf-${Math.random()}.local`, []);

    React.useEffect(() => {
        const OriginalWebSocket = window.WebSocket;
        const winRecord = window as unknown as Record<string, unknown>;

        class StreamingMockWebSocket {
            url: string;
            onopen: ((ev: Event) => void) | null = null;
            onmessage: ((ev: MessageEvent) => void) | null = null;
            onclose: ((ev: CloseEvent) => void) | null = null;
            onerror: ((ev: Event) => void) | null = null;
            readyState = 1;
            OPEN = 1;
            CLOSED = 3;
            private intervalId: NodeJS.Timeout | null = null;
            private messageCount = 0;
            private maxMessages = 200;

            constructor(url: string) {
                this.url = url;
                // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
                setTimeout(() => {
                    if (this.onopen) {
                        this.onopen(new Event('open'));
                    }
                    // Start sending messages at 10/second
                    this.startStreaming();
                }, 10);
            }

            private startStreaming(): void {
                // Send 10 messages per second (interval of 100ms)
                this.intervalId = setInterval(() => {
                    if (this.messageCount >= this.maxMessages) {
                        this.stopStreaming();
                        return;
                    }

                    // Generate a batch of messages
                    const entries: LogEntry[] = [];
                    for (let i = 0; i < 1; i++) {
                        const timestamp = BASE_TIME - (this.maxMessages - this.messageCount) * 100;
                        const levels = [
                            {level: 30, levelName: 'info'},
                            {level: 40, levelName: 'warn'},
                            {level: 50, levelName: 'error'},
                            {level: 20, levelName: 'debug'},
                        ] as const;
                        const services = ['payment', 'ledger', 'participant', 'agreement'];
                        const levelInfo = levels[this.messageCount % levels.length];
                        const service = services[this.messageCount % services.length];

                        entries.push({
                            id: `perf-${this.messageCount}`,
                            time: timestamp,
                            level: levelInfo.level,
                            levelName: levelInfo.levelName,
                            name: service,
                            msg: `Performance test message ${this.messageCount + 1}/${this.maxMessages}`,
                            traceId: `trace-${Math.floor(this.messageCount / 10)}`,
                        });

                        this.messageCount++;
                    }

                    if (this.onmessage && entries.length > 0) {
                        this.onmessage(
                            new MessageEvent('message', {
                                data: JSON.stringify({
                                    type: 'entries',
                                    entries,
                                }),
                            }),
                        );
                    }
                }, 50); // 50ms = 20 messages per second
            }

            private stopStreaming(): void {
                if (this.intervalId) {
                    clearInterval(this.intervalId);
                    this.intervalId = null;
                }
            }

            send(_data: string): void {
                // Mock send
            }

            close(): void {
                this.stopStreaming();
                this.readyState = this.CLOSED;
                // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
                setTimeout(() => {
                    if (this.onclose) {
                        this.onclose(new CloseEvent('close'));
                    }
                }, 10);
            }
        }

        winRecord.WebSocket = function (url: string, protocols?: string | string[]) {
            if (url === mockWsUrl) {
                return new StreamingMockWebSocket(url);
            }
            return new OriginalWebSocket(url, protocols);
        };

        (winRecord.WebSocket as Record<string, number>).CONNECTING = 0;
        (winRecord.WebSocket as Record<string, number>).OPEN = 1;
        (winRecord.WebSocket as Record<string, number>).CLOSING = 2;
        (winRecord.WebSocket as Record<string, number>).CLOSED = 3;

        return () => {
            winRecord.WebSocket = OriginalWebSocket;
        };
    }, [mockWsUrl]);

    const configWithMockWs = React.useMemo(
        () => ({
            ...darkThemeConfig,
            wsUrl: mockWsUrl,
        }),
        [mockWsUrl],
    );

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
            }}
        >
            <LogViewer config={configWithMockWs} />
        </div>
    );
}

export const PerformanceTest: Story = {
    parameters: {
        chromatic: {
            delay: 11000,
        },
    },
    render: PerformanceTestStory,
};

// ── Filter Testing Stories ────────────────────────────────────────────────────

/**
 * Filter test: Verifies that filters are properly sent to server and respected.
 * Set filters (level, service name, trace ID, has error) and watch as subsequent
 * messages match only the filter criteria. The mock server filters new messages
 * based on the received filter before sending them to the client.
 */
interface WsMockFilters {
    level?: string;
    name?: string;
    traceId?: string;
    hasError?: boolean;
}

function FilteredServerStory(): React.ReactElement {
    const mockWsUrl = React.useMemo(() => `ws://storybook-mock-filter-${Math.random()}.local`, []);

    React.useEffect(() => {
        const OriginalWebSocket = window.WebSocket;
        const winRecord = window as unknown as Record<string, unknown>;

        class FilteredMockWebSocket {
            url: string;
            onopen: ((ev: Event) => void) | null = null;
            onmessage: ((ev: MessageEvent) => void) | null = null;
            onclose: ((ev: CloseEvent) => void) | null = null;
            onerror: ((ev: Event) => void) | null = null;
            readyState = 1;
            OPEN = 1;
            CLOSED = 3;
            private intervalId: NodeJS.Timeout | null = null;
            private messageCount = 0;
            private maxMessages = 50;
            private filters: WsMockFilters = {};

            constructor(url: string) {
                this.url = url;
                // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
                setTimeout(() => {
                    if (this.onopen) {
                        this.onopen(new Event('open'));
                    }
                    // Send initial unfiltered messages
                    this.sendInitialMessages();
                    // Start sending filtered messages periodically
                    this.startStreaming();
                }, 10);
            }

            private sendInitialMessages(): void {
                // Send a diverse set of initial messages
                const initialEntries: LogEntry[] = [
                    {
                        id: 'init-1',
                        time: BASE_TIME - 5000,
                        level: 30,
                        levelName: 'info',
                        name: 'payment',
                        msg: 'Initial payment service message',
                        traceId: 'trace-init-1',
                    },
                    {
                        id: 'init-2',
                        time: BASE_TIME - 4000,
                        level: 50,
                        levelName: 'error',
                        name: 'ledger',
                        msg: 'Initial ledger error',
                        traceId: 'trace-init-2',
                        err: {type: 'Error', message: 'Test error'},
                    },
                    {
                        id: 'init-3',
                        time: BASE_TIME - 3000,
                        level: 40,
                        levelName: 'warn',
                        name: 'participant',
                        msg: 'Initial participant warning',
                        traceId: 'trace-init-3',
                    },
                ];

                if (this.onmessage) {
                    this.onmessage(
                        new MessageEvent('message', {
                            data: JSON.stringify({
                                type: 'entries',
                                entries: initialEntries,
                            }),
                        }),
                    );
                }
            }

            private matchesFilter(entry: LogEntry): boolean {
                // Apply server-side filtering based on received filter criteria
                if (this.filters.level && entry.levelName !== this.filters.level) {
                    return false;
                }
                if (this.filters.name && entry.name !== this.filters.name) {
                    return false;
                }
                if (this.filters.traceId && entry.traceId !== this.filters.traceId) {
                    return false;
                }
                if (this.filters.hasError && !entry.err) {
                    return false;
                }
                return true;
            }

            private startStreaming(): void {
                // Send messages every 500ms
                this.intervalId = setInterval(() => {
                    if (this.messageCount >= this.maxMessages) {
                        this.stopStreaming();
                        return;
                    }

                    // Generate a diverse message that may or may not match filters
                    const timestamp = BASE_TIME;
                    const levels = [
                        {level: 30, levelName: 'info'},
                        {level: 40, levelName: 'warn'},
                        {level: 50, levelName: 'error'},
                        {level: 20, levelName: 'debug'},
                    ] as const;
                    const services = ['payment', 'ledger', 'participant', 'agreement'];
                    const levelInfo = levels[this.messageCount % levels.length];
                    const service = services[this.messageCount % services.length];
                    const hasError = this.messageCount % 3 === 0;

                    const entry: LogEntry = {
                        id: `stream-${this.messageCount}`,
                        time: timestamp,
                        level: levelInfo.level,
                        levelName: levelInfo.levelName,
                        name: service,
                        msg: `Streamed ${service} message ${this.messageCount + 1} (level: ${levelInfo.levelName})`,
                        traceId: `trace-stream-${Math.floor(this.messageCount / 5)}`,
                    };

                    if (hasError) {
                        entry.err = {
                            type: 'StreamError',
                            message: `Error in message ${this.messageCount + 1}`,
                        };
                    }

                    this.messageCount++;

                    // Only send if it matches the current filter
                    if (this.matchesFilter(entry) && this.onmessage) {
                        this.onmessage(
                            new MessageEvent('message', {
                                data: JSON.stringify({
                                    type: 'entries',
                                    entries: [entry],
                                }),
                            }),
                        );
                    }
                }, 500);
            }

            private stopStreaming(): void {
                if (this.intervalId) {
                    clearInterval(this.intervalId);
                    this.intervalId = null;
                }
            }

            send(data: string): void {
                // Capture filter/subscribe messages
                try {
                    const msg = JSON.parse(data);
                    if (msg.type === 'subscribe') {
                        // Update filters based on subscribe message
                        this.filters = {
                            level: msg.level,
                            name: msg.name,
                            traceId: msg.traceId,
                            hasError: msg.hasError,
                        };
                        console.log('Mock server received filters:', this.filters);
                    }
                } catch (_e) {
                    // Ignore parse errors
                }
            }

            close(): void {
                this.stopStreaming();
                this.readyState = this.CLOSED;

                // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout
                setTimeout(() => {
                    if (this.onclose) {
                        this.onclose(new CloseEvent('close'));
                    }
                }, 10);
            }
        }

        winRecord.WebSocket = function (url: string, protocols?: string | string[]) {
            if (url === mockWsUrl) {
                return new FilteredMockWebSocket(url);
            }
            return new OriginalWebSocket(url, protocols);
        };

        (winRecord.WebSocket as Record<string, number>).CONNECTING = 0;
        (winRecord.WebSocket as Record<string, number>).OPEN = 1;
        (winRecord.WebSocket as Record<string, number>).CLOSING = 2;
        (winRecord.WebSocket as Record<string, number>).CLOSED = 3;

        return () => {
            winRecord.WebSocket = OriginalWebSocket;
        };
    }, [mockWsUrl]);

    const configWithMockWs = React.useMemo(
        () => ({
            ...darkThemeConfig,
            wsUrl: mockWsUrl,
        }),
        [mockWsUrl],
    );

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
            }}
        >
            <LogViewer config={configWithMockWs} />
        </div>
    );
}

export const FilteredServer: Story = {
    render: FilteredServerStory,
};
