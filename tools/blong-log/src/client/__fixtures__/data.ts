/**
 * Test fixture data for LogViewer stories.
 *
 * Provides deterministic log entries for visual testing.
 */

import type {ClientConfig, LogEntry} from '../../types.ts';

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
        msg: messages[i % messages.length].replace('${ms}', String(Math.floor(500 + i))),
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

// ── lukaot records ───────────────────────────────────────────────────────────

/**
 * The records the framework writes now, with the three capture shapes it ships.
 *
 * These are the shapes the viewer has to read: a declared signal carries `fields.signal` and
 * `fields.params` and repeats the identifier at the top level; a capture carries `fields.capture`,
 * `fields.shape` and `fields.rung` beside the fields its shape rendered, with the payload in
 * `fields.payload`; a port failure carries the error at the top level and its type in the fields.
 *
 * The frames are the ones an ISO 8583 corridor actually sends: an ASCII MTI behind a two-byte length,
 * a binary bitmap that reads as dots in the ASCII column, and the field data after it. That contrast is
 * the whole point of drawing both columns (`@@D-927`).
 */
const hex = (bytes: number[]): string =>
    bytes.map(byte => byte.toString(16).padStart(2, '0')).join(' ');

/** `0200` plus a bitmap, a 16-digit pan and a 12-digit amount — 40 bytes. */
const REQUEST_FRAME = hex([
    0x00, 0x28, 0x30, 0x32, 0x30, 0x30, 0x3c, 0x24, 0x04, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00,
    0x16, 0x34, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31,
    0x35, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
]);

/** `0210` plus an approved response code — 18 bytes. */
const RESPONSE_FRAME = hex([
    0x00, 0x12, 0x30, 0x32, 0x31, 0x30, 0x3c, 0x24, 0x04, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00,
    0x30, 0x30,
]);

const LUKAOT_TIME = new Date('2026-11-20T09:14:02.000Z').getTime();

export const lukaotEntries: LogEntry[] = [
    {
        id: makeId(201),
        time: LUKAOT_TIME,
        level: 20,
        levelName: 'debug',
        msg: 'watching /home/dev/blong/realm/blong-agent',
        service: 'blong',
        signal: 'frameworkWatchStarted',
        fields: {
            context: 'Watch',
            signal: 'frameworkWatchStarted',
            params: {folders: '/home/dev/blong/realm/blong-agent'},
        },
    },
    {
        id: makeId(202),
        time: LUKAOT_TIME + 40,
        level: 30,
        levelName: 'info',
        msg: 'generating dir /home/dev/blong/core/blong-server/orchestrator/subject',
        service: 'blong',
        signal: 'frameworkSchemaDirScanning',
        fields: {
            context: 'ApiSchema',
            signal: 'frameworkSchemaDirScanning',
            params: {dir: '/home/dev/blong/core/blong-server/orchestrator/subject'},
        },
    },
    {
        id: makeId(203),
        time: LUKAOT_TIME + 120,
        level: 40,
        levelName: 'warn',
        msg: 'no signing key: no key configured and none was generated',
        service: 'blong',
        signal: 'frameworkGatewayKeyMissing',
        fields: {
            context: 'Gateway',
            signal: 'frameworkGatewayKeyMissing',
            params: {usage: 'signing', reason: 'no key configured and none was generated'},
            messageId: 'event',
            operation: 'gateway.key.resolve',
        },
        traceId: TRACE_ID_A,
    },
    {
        id: makeId(204),
        time: LUKAOT_TIME + 160,
        level: 30,
        levelName: 'info',
        msg: 'http exchange',
        service: 'blong',
        signal: 'frameworkHttpExchange',
        traceId: TRACE_ID_A,
        fields: {
            context: 'srv.http',
            signal: 'frameworkHttpExchange',
            capture: 'frameworkHttpExchange',
            shape: 'http.exchange',
            rung: 'body',
            bytes: 96,
            phase: 'request',
            method: 'POST',
            url: 'https://hub.example.com/rpc/chat/message/post',
            headers: 'content-type, authorization, accept, x-blong-language',
            payload: JSON.stringify({
                jsonrpc: '2.0',
                method: 'chat.message.post',
                params: {channel: 'C0CK271R4L9', text: 'the corridor is up'},
                id: makeId(211),
            }),
        },
    },
    {
        id: makeId(205),
        time: LUKAOT_TIME + 200,
        level: 30,
        levelName: 'info',
        msg: 'tcp frame',
        service: 'blong',
        signal: 'frameworkTcpFrame',
        traceId: TRACE_ID_A,
        fields: {
            context: 'srv.tcp',
            signal: 'frameworkTcpFrame',
            capture: 'frameworkTcpFrame',
            shape: 'tcp.frame',
            rung: 'full',
            bytes: 40,
            direction: 'out',
            ascii: '.(0200<$.........16',
            payload: REQUEST_FRAME,
        },
    },
    {
        id: makeId(206),
        time: LUKAOT_TIME + 260,
        level: 30,
        levelName: 'info',
        msg: 'tcp frame',
        service: 'blong',
        signal: 'frameworkTcpFrame',
        traceId: TRACE_ID_A,
        fields: {
            context: 'srv.tcp',
            signal: 'frameworkTcpFrame',
            capture: 'frameworkTcpFrame',
            shape: 'tcp.frame',
            rung: 'hex',
            bytes: 18,
            direction: 'in',
            ascii: '.(0210<$.........00',
            payload: RESPONSE_FRAME,
        },
    },
    {
        id: makeId(207),
        time: LUKAOT_TIME + 300,
        level: 30,
        levelName: 'info',
        msg: 'json payload',
        service: 'blong',
        signal: 'frameworkJsonPayload',
        traceId: TRACE_ID_A,
        fields: {
            context: 'srv.http',
            signal: 'frameworkJsonPayload',
            capture: 'frameworkJsonPayload',
            shape: 'json',
            rung: 'body',
            bytes: 118,
            label: 'mle.result',
            keys: ['transferId', 'state', 'payer', 'payee', 'amount'],
            payload: JSON.stringify({
                transferId: makeId(211),
                state: 'COMMITTED',
                payer: {dfsp: 'payerfsp', account: '****4471'},
                payee: {dfsp: 'payeefsp', account: '****9930'},
                amount: {currency: 'USD', value: 2500},
            }),
        },
    },
    {
        id: makeId(208),
        time: LUKAOT_TIME + 340,
        level: 30,
        levelName: 'info',
        msg: 'tcp frame',
        service: 'blong',
        signal: 'frameworkTcpFrame',
        fields: {
            context: 'srv.tcp',
            signal: 'frameworkTcpFrame',
            capture: 'frameworkTcpFrame',
            shape: 'tcp.frame',
            rung: 'line',
            bytes: 256,
            direction: 'in',
        },
    },
    {
        id: makeId(209),
        time: LUKAOT_TIME + 400,
        level: 50,
        levelName: 'error',
        msg: 'db.subject.find failed',
        service: 'blong',
        signal: 'frameworkPortFailure',
        traceId: TRACE_ID_A,
        err: {
            type: 'Error',
            message: 'connection terminated unexpectedly',
            stack:
                'Error: connection terminated unexpectedly\n' +
                '    at Client.end (node_modules/pg/lib/client.js:132:5)\n' +
                '    at AdapterBase.error (/core/blong-gogo/src/AdapterBase.ts:270:1)',
        },
        fields: {
            context: 'srv.db',
            signal: 'frameworkPortFailure',
            type: 'error.db.connectionLost',
            statusCode: 503,
            messageId: 'error',
            operation: 'db.subject.find',
            params: {subject: 'party', object: 'party'},
        },
    },
    {
        id: makeId(210),
        time: LUKAOT_TIME + 440,
        level: 30,
        levelName: 'info',
        msg: 'http exchange',
        service: 'blong',
        signal: 'frameworkHttpExchange',
        traceId: TRACE_ID_A,
        fields: {
            context: 'srv.http',
            signal: 'frameworkHttpExchange',
            capture: 'frameworkHttpExchange',
            shape: 'http.exchange',
            rung: 'headers',
            bytes: 0,
            phase: 'response',
            method: 'POST',
            url: 'https://hub.example.com/rpc/chat/message/post',
            statusCode: 200,
            durationMs: 41,
            headers: 'content-type, x-request-id, cache-control',
        },
    },
];

export const lukaotCaptures = lukaotEntries.filter(
    entry => entry.fields?.['capture'] !== undefined,
);

/**
 * The rest of what a record can say: the branch it reports, the call it is one end of, who asked for the
 * work and what caused it (`@@D-926`).
 *
 * Two records rather than one, because they are the two things a reader looks for separately: a decision
 * explains why a branch was taken, a flow leg says which call a record belongs to and where in the
 * execution it sits.
 */
export const lukaotContextRecords: LogEntry[] = [
    {
        id: makeId(221),
        time: LUKAOT_TIME + 500,
        level: 30,
        levelName: 'info',
        msg: 'deployment granularity chosen',
        service: 'blong',
        fields: {
            context: 'controller.reconcile',
            signal: 'kustomizeGranularityDecided',
            params: {deployment: 'blong-suite'},
        },
        refs: {record: '01M7REF221', parent: '01M7REF200', trace: TRACE_ID_A},
        intent: {name: 'release-cd', actor: 'deployer', tenant: 'comesa', priority: 2},
        flow: {
            id: '01M7RUN221',
            kind: 'kustomize.reconcile',
            leg: 'controller.cluster',
            legFrom: 'controller',
            legTo: 'cluster',
            legSeq: '1.2',
            step: 'plan',
            status: 'running',
        },
        decision: {
            discriminator: 'deployment-granularity',
            candidates: ['one-process', 'per-realm', 'per-layer'],
            chosen: 'per-realm',
            values: {realms: 4, layers: 11},
        },
    },
    {
        id: makeId(222),
        time: LUKAOT_TIME + 560,
        level: 30,
        levelName: 'info',
        msg: 'POST /rpc/kustomize/deployment/apply',
        service: 'blong',
        fields: {context: 'srv.gateway', signal: 'frameworkHttpRequest'},
        refs: {record: '01M7REF222', parent: '01M7REF221', trace: TRACE_ID_A},
        intent: {name: 'release-cd', actor: 'deployer', tenant: 'comesa'},
        req: {
            operation: 'POST',
            target: '/rpc/kustomize/deployment/apply',
            headers: {'x-request-id': 'r-1'},
        },
        res: {status: 202, elapsedMs: 18, headers: {'content-type': 'application/json'}},
    },
];

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
