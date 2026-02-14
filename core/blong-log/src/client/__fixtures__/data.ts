/**
 * Test fixture data for LogViewer stories.
 *
 * Provides deterministic log entries for visual testing.
 */

import type {ClientConfig, LogEntry} from '../../types.js';

// Use a fixed base time for deterministic rendering
const BASE_TIME = new Date('2026-02-13T12:00:00.000Z').getTime();

/**
 * Generates a deterministic ULID-like id from an index.
 */
function makeId(index: number): string {
    const hex = index.toString(16).padStart(10, '0').toUpperCase();
    return `01ARYZ6S41${hex}${hex.substring(0, 16).padStart(16, '0')}`;
}

export const TRACE_ID_A = 'abc123def4567890abcd1234';
export const TRACE_ID_B = 'ff00aabb11223344eeff0011';

export const sampleEntries: LogEntry[] = [
    {
        id: makeId(1),
        time: BASE_TIME,
        level: 30,
        levelName: 'info',
        name: 'gateway',
        msg: 'Server listening on port 8080',
    },
    {
        id: makeId(2),
        time: BASE_TIME + 100,
        level: 20,
        levelName: 'debug',
        name: 'auth',
        msg: 'Token validation started',
        traceId: TRACE_ID_A,
    },
    {
        id: makeId(3),
        time: BASE_TIME + 200,
        level: 30,
        levelName: 'info',
        name: 'auth',
        msg: 'User authenticated successfully',
        traceId: TRACE_ID_A,
        req: {method: 'POST', url: '/rpc/login/token/create', hostname: 'localhost'},
        res: {statusCode: 200, responseTime: 42},
    },
    {
        id: makeId(4),
        time: BASE_TIME + 300,
        level: 40,
        levelName: 'warn',
        name: 'payment',
        msg: 'Rate limit approaching threshold (85%)',
        traceId: TRACE_ID_B,
    },
    {
        id: makeId(5),
        time: BASE_TIME + 400,
        level: 50,
        levelName: 'error',
        name: 'payment',
        msg: 'Transfer preparation failed',
        traceId: TRACE_ID_B,
        err: {type: 'TransferError', message: 'Insufficient funds in payer account'},
        req: {method: 'POST', url: '/rpc/payment/transfer/prepare'},
        res: {statusCode: 500, responseTime: 128},
    },
    {
        id: makeId(6),
        time: BASE_TIME + 500,
        level: 10,
        levelName: 'trace',
        name: 'discovery',
        msg: 'Participant lookup cache miss for MSISDN +256774185432',
    },
    {
        id: makeId(7),
        time: BASE_TIME + 600,
        level: 60,
        levelName: 'fatal',
        name: 'ledger',
        msg: 'Database connection pool exhausted',
        err: {
            type: 'ConnectionError',
            message: 'Cannot acquire connection from pool',
            stack: 'Error: Cannot acquire connection from pool\n    at Pool.acquire (pool.ts:42)',
        },
    },
    {
        id: makeId(8),
        time: BASE_TIME + 700,
        level: 30,
        levelName: 'info',
        name: 'gateway',
        msg: 'Health check passed',
        req: {method: 'GET', url: '/health'},
        res: {statusCode: 200, responseTime: 2},
    },
    {
        id: makeId(9),
        time: BASE_TIME + 800,
        level: 20,
        levelName: 'debug',
        name: 'participant',
        msg: 'Cache refreshed for 142 participants',
        traceId: TRACE_ID_A,
    },
    {
        id: makeId(10),
        time: BASE_TIME + 900,
        level: 30,
        levelName: 'info',
        name: 'agreement',
        msg: 'Agreement created between parties',
        traceId: TRACE_ID_A,
        req: {method: 'POST', url: '/rpc/agreement/agreement/create'},
        res: {statusCode: 201, responseTime: 85},
    },
    {
        id: makeId(11),
        time: BASE_TIME + 1000,
        level: 40,
        levelName: 'warn',
        name: 'gateway',
        msg: 'Slow request detected',
        req: {method: 'GET', url: '/rpc/ledger/account/list'},
        res: {statusCode: 200, responseTime: 3200},
    },
    {
        id: makeId(12),
        time: BASE_TIME + 1100,
        level: 50,
        levelName: 'error',
        name: 'auth',
        msg: 'Invalid token signature',
        err: {type: 'JWTError', message: 'Token signature verification failed'},
        req: {method: 'GET', url: '/rpc/participant/participant/get'},
        res: {statusCode: 401, responseTime: 5},
    },
];

/** Entries filtered to only errors and above */
export const errorEntries = sampleEntries.filter(e => (e.level ?? 0) >= 50);

/** Entries filtered to a single trace */
export const traceEntries = sampleEntries.filter(e => e.traceId === TRACE_ID_A);

/** Entries with detailed HTTP headers and body for showcase */
export const httpDetailedEntries: LogEntry[] = [
    {
        id: makeId(200),
        time: BASE_TIME + 1000,
        level: 30,
        levelName: 'info',
        name: 'payment',
        msg: 'Transfer prepared successfully',
        traceId: TRACE_ID_A,
        req: {
            method: 'POST',
            url: '/rpc/payment/transfer/prepare',
            hostname: 'api.example.com',
            headers: {
                'content-type': 'application/json',
                authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                'x-trace-id': TRACE_ID_A,
                'user-agent': 'blong-client/1.0.0',
                accept: 'application/json',
            },
            body: {
                payerFsp: 'dfsp1',
                payeeFsp: 'dfsp2',
                amount: {currency: 'USD', amount: '100.00'},
                transactionType: 'TRANSFER',
            },
        },
        res: {
            statusCode: 200,
            responseTime: 156,
            headers: {
                'content-type': 'application/json',
                'x-request-id': 'req-12345',
                'cache-control': 'no-cache',
            },
            body: {
                transferId: 'txn-a1b2c3d4',
                state: 'RESERVED',
                expiresAt: '2026-02-14T12:35:00Z',
            },
        },
    },
    {
        id: makeId(201),
        time: BASE_TIME + 1100,
        level: 50,
        levelName: 'error',
        name: 'participant',
        msg: 'Participant registration failed',
        traceId: TRACE_ID_B,
        err: {type: 'ValidationError', message: 'Invalid MSISDN format'},
        req: {
            method: 'POST',
            url: '/rpc/participant/participant/add',
            hostname: 'api.example.com',
            headers: {
                'content-type': 'application/json',
                authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                'x-trace-id': TRACE_ID_B,
            },
            body: {
                partyIdType: 'MSISDN',
                partyIdentifier: '123456',
                fspId: 'dfsp1',
            },
        },
        res: {
            statusCode: 400,
            responseTime: 23,
            headers: {
                'content-type': 'application/json',
                'x-request-id': 'req-67890',
            },
            body: {
                error: 'VALIDATION_ERROR',
                message: 'MSISDN must start with country code (+)',
                field: 'partyIdentifier',
            },
        },
    },
    {
        id: makeId(202),
        time: BASE_TIME + 1200,
        level: 30,
        levelName: 'info',
        name: 'ledger',
        msg: 'Account balance retrieved',
        req: {
            method: 'GET',
            url: '/rpc/ledger/account/get?accountId=acc-12345',
            hostname: 'api.example.com',
            headers: {
                authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                accept: 'application/json',
                'if-none-match': 'W/"1234567890"',
            },
        },
        res: {
            statusCode: 200,
            responseTime: 45,
            headers: {
                'content-type': 'application/json',
                etag: 'W/"1234567890"',
                'cache-control': 'max-age=60',
                'x-rate-limit-remaining': '95',
            },
            body: {
                accountId: 'acc-12345',
                balance: {currency: 'USD', amount: '1250.50'},
                status: 'ACTIVE',
                lastModified: '2026-02-14T12:30:00Z',
            },
        },
    },
];

/** Large dataset for performance testing */
export function generateLargeDataset(count: number): LogEntry[] {
    const services = [
        'gateway',
        'auth',
        'payment',
        'ledger',
        'discovery',
        'participant',
        'agreement',
    ];
    const levels = [10, 20, 30, 30, 30, 40, 50] as const;
    const levelNames = ['trace', 'debug', 'info', 'info', 'info', 'warn', 'error'] as const;
    const messages = [
        'Request processed',
        'Cache updated',
        'Connection established',
        'Timeout occurred',
        'Validation passed',
        'Rate limit checked',
        'Batch processed',
        'Event published',
        'Query executed in ${ms}ms',
        'Webhook delivered',
    ];

    return Array.from({length: count}, (_, i) => ({
        id: makeId(100 + i),
        time: BASE_TIME + i * 50,
        level: levels[i % levels.length],
        levelName: levelNames[i % levelNames.length],
        name: services[i % services.length],
        msg: messages[i % messages.length].replace(
            '${ms}',
            String(Math.floor(Math.random() * 500)),
        ),
        traceId: i % 5 === 0 ? TRACE_ID_A : i % 7 === 0 ? TRACE_ID_B : undefined,
        ...(i % 4 === 0
            ? {
                  req: {
                      method: i % 2 === 0 ? 'GET' : 'POST',
                      url: `/rpc/${services[i % services.length]}/entity/action`,
                  },
                  res: {
                      statusCode: levels[i % levels.length] >= 50 ? 500 : 200,
                      responseTime: 10 + (i % 200),
                  },
              }
            : {}),
    }));
}

export const darkThemeConfig: ClientConfig = {
    wsUrl: 'ws://localhost:9998',
    apiUrl: 'http://localhost:9998/api',
    properties: {},
    recentCount: 200,
    traceUrlPattern: 'https://jaeger.example.com/trace/{traceId}?start={startTime}&end={endTime}',
    theme: {
        mode: 'dark',
        levels: {
            trace: '#6e7681',
            debug: '#58a6ff',
            info: '#3fb950',
            warn: '#d29922',
            error: '#f85149',
            fatal: '#da3633',
        },
        syntax: {
            string: '#7ee787',
            number: '#ffa657',
            boolean: '#ff7b72',
            null: '#8b949e',
            key: '#79c0ff',
            punctuation: '#c9d1d9',
        },
    },
};

export const lightThemeConfig: ClientConfig = {
    ...darkThemeConfig,
    theme: {
        mode: 'light',
        levels: {
            trace: '#8b949e',
            debug: '#0969da',
            info: '#1a7f37',
            warn: '#9a6700',
            error: '#cf222e',
            fatal: '#a40e26',
        },
        syntax: {
            string: '#0a3069',
            number: '#953800',
            boolean: '#cf222e',
            null: '#6e7781',
            key: '#8250df',
            punctuation: '#57606a',
        },
    },
};
