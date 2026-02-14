/**
 * Shared type definitions for blong-log
 */

export interface LogEntry {
    /** ULID identifier for the log entry */
    id: string;
    /** ISO timestamp */
    time?: number;
    /** Log level numeric value */
    level?: number;
    /** Log level name */
    levelName?: string;
    /** Log message */
    msg?: string;
    /** Service/module name */
    name?: string;
    /** Trace ID for distributed tracing */
    traceId?: string;
    /** Error/exception information */
    err?: {
        message?: string;
        stack?: string;
        type?: string;
    };
    /** HTTP request information */
    req?: {
        method?: string;
        url?: string;
        hostname?: string;
        headers?: Record<string, string>;
        body?: unknown;
    };
    /** HTTP response information */
    res?: {
        statusCode?: number;
        headers?: Record<string, string>;
        body?: unknown;
        responseTime?: number;
    };
    /** Meta information from blong framework */
    $meta?: {
        mtid?: string;
        method?: string;
        [key: string]: unknown;
    };
    /** All original properties */
    [key: string]: unknown;
}

export interface FilterOptions {
    /** Filter by log level (minimum level) */
    level?: string;
    /** Filter by service name */
    name?: string;
    /** Filter by trace ID */
    traceId?: string;
    /** Free text search across all properties */
    search?: string;
    /** Filter by specific property values */
    properties?: Record<string, string>;
    /** Return entries after this ULID */
    after?: string;
    /** Maximum number of entries to return */
    limit?: number;
}

export interface LogServerOptions {
    /** UDP port to listen on for log entries (default: 9999) */
    udpPort?: number;
    /** HTTP port for REST and WebSocket APIs (default: 9998) */
    httpPort?: number;
    /** Host to bind to (default: '127.0.0.1') */
    host?: string;
    /** Maximum number of log entries to keep in buffer (default: 10000) */
    bufferSize?: number;
    /** Number of recent entries to send on client connect (default: 200) */
    recentCount?: number;
    /** Maximum UDP packet size in bytes (default: 65507) */
    maxPacketSize?: number;
    /** Properties to recognize for special UI handling */
    properties?: PropertyConfig;
    /** URL pattern for trace view, with {traceId} and {timeRange} placeholders */
    traceUrlPattern?: string;
    /** Theme configuration */
    theme?: ThemeConfig;
    /** Path to serve client assets from (default: '/') */
    clientPath?: string;
}

export interface PropertyConfig {
    /** Property name for timestamp (default: 'time') */
    timestamp?: string;
    /** Property name for log level (default: 'level') */
    level?: string;
    /** Property name for service name (default: 'name') */
    name?: string;
    /** Property name for trace ID (default: 'traceId') */
    traceId?: string;
    /** Property name for error (default: 'err') */
    error?: string;
    /** Property name for HTTP request (default: 'req') */
    request?: string;
    /** Property name for HTTP response (default: 'res') */
    response?: string;
    /** Additional custom properties to display as filterable columns */
    custom?: Array<{
        name: string;
        label: string;
        filterable?: boolean;
        values?: string[];
    }>;
}

export interface ThemeConfig {
    /** Theme mode */
    mode?: 'dark' | 'light';
    /** Colors for log levels */
    levels?: {
        trace?: string;
        debug?: string;
        info?: string;
        warn?: string;
        error?: string;
        fatal?: string;
    };
    /** Colors for syntax highlighting */
    syntax?: {
        string?: string;
        number?: string;
        boolean?: string;
        null?: string;
        key?: string;
    };
}

export interface ClientConfig {
    /** WebSocket URL for real-time updates */
    wsUrl: string;
    /** REST API base URL */
    apiUrl: string;
    /** Property configuration */
    properties: PropertyConfig;
    /** Number of recent entries to load */
    recentCount: number;
    /** URL pattern for trace view */
    traceUrlPattern?: string;
    /** Theme configuration */
    theme: ThemeConfig;
}

/** Internal: UDP batch packet header */
export interface BatchHeader {
    /** 8-byte batch ID */
    batchId: string;
    /** Packet index within batch */
    packetIndex: number;
    /** Total packets in batch */
    totalPackets: number;
}

/** WebSocket message types */
export type WsMessage =
    | {type: 'subscribe'; filters?: FilterOptions}
    | {type: 'unsubscribe'}
    | {type: 'entries'; entries: LogEntry[]}
    | {type: 'entry'; entry: LogEntry}
    | {type: 'config'; config: ClientConfig};

/** Pino log level name to numeric value mapping */
export const LEVEL_MAP: Record<string, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

/** Numeric log level to name mapping */
export const LEVEL_NAME: Record<number, string> = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
};
