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
    /** The service that wrote the line — `blong` unless a suite names its own */
    service?: string;
    /** The declared signal identifier, promoted from the line's fields (`frameworkPortFailure`) */
    signal?: string;
    /** The values a line carries, nested by lukaot: `context`, `signal`, `params`, `capture`, `shape` */
    fields?: Record<string, unknown>;
    /** The service/module name as the pino era wrote it — read `service` first */
    name?: string;
    /** Trace ID for distributed tracing */
    traceId?: string;
    /** Error/exception information */
    err?: {
        message?: string;
        stack?: string;
        type?: string;
    };
    /**
     * HTTP request information.
     *
     * Two spellings, because two eras wrote it: lukaot writes `operation`/`target`, and a record from
     * before the conversion wrote `method`/`url`/`hostname`. Read it through `exchangeOf`, which knows
     * both (`@@D-926`).
     */
    req?: {
        /** The method — lukaot's spelling. */
        operation?: string;
        /** Where the call went — lukaot's spelling. */
        target?: string;
        /** The method and the URL — the pre-conversion spelling. */
        method?: string;
        /** The URL — the pre-conversion spelling. */
        url?: string;
        hostname?: string;
        headers?: Record<string, string>;
        body?: unknown;
    };
    /** HTTP response information, in either spelling — see `exchangeOf`. */
    res?: {
        /** The status — lukaot's spelling. */
        status?: number;
        /** How long it took — lukaot's spelling. */
        elapsedMs?: number;
        /** The status — the pre-conversion spelling. */
        statusCode?: number;
        /** How long it took — the pre-conversion spelling. */
        responseTime?: number;
        headers?: Record<string, string>;
        body?: unknown;
    };
    /** The run, step and call this record belongs to — see `flowOf`. */
    flow?: Record<string, unknown>;
    /** The branch this record reports — see `decisionOf`. */
    decision?: Record<string, unknown>;
    /** On whose behalf the work ran — see `intentOf`. */
    intent?: Record<string, unknown>;
    /** The references the record carries: its own, its template, its trace, its parent and payloads. */
    refs?: Record<string, unknown>;
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
    /** Filter by the port or component that reported it (`fields.context`, else the service) */
    name?: string;
    /** Filter by the declared signal identifier */
    signal?: string;
    /** Filter by the capture shape that rendered a payload — `tcp.frame`, `http.exchange`, `json` */
    capture?: string;
    /** Filter by trace ID */
    traceId?: string;
    /** Free text search across all properties */
    search?: string;
    /** Filter by specific property values */
    properties?: Record<string, string>;
    /** Filter to only entries with errors */
    hasError?: boolean;
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
        punctuation?: string;
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
