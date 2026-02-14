/**
 * Pino transport that sends log entries via UDP to the blong-log server.
 *
 * Usage in Pino configuration:
 * ```typescript
 * import pino from 'pino';
 *
 * const logger = pino({
 *     transport: {
 *         target: '@feasibleone/blong-log/transport',
 *         options: {
 *             host: '127.0.0.1',
 *             port: 9999,
 *             batchSize: 10,
 *             flushInterval: 100,
 *         },
 *     },
 * });
 * ```
 *
 * Can also be used as one of multiple Pino transports:
 * ```typescript
 * const logger = pino({
 *     transport: {
 *         targets: [
 *             {target: 'pino-pretty', options: {singleLine: true}},
 *             {target: '@feasibleone/blong-log/transport', options: {port: 9999}},
 *         ],
 *     },
 * });
 * ```
 */

import {randomBytes} from 'node:crypto';
import dgram from 'node:dgram';
import build from 'pino-abstract-transport';

export interface TransportOptions {
    /** UDP target host (default: '127.0.0.1') */
    host?: string;
    /** UDP target port (default: 9999) */
    port?: number;
    /** Max entries per UDP batch (default: 10) */
    batchSize?: number;
    /** Flush interval in ms (default: 100) */
    flushInterval?: number;
    /** Max UDP packet size in bytes (default: 65000) */
    maxPacketSize?: number;
}

const DEFAULT_OPTIONS: Required<TransportOptions> = {
    host: '127.0.0.1',
    port: 9999,
    batchSize: 10,
    flushInterval: 100,
    maxPacketSize: 65000,
};

/**
 * Header format for UDP batch packets:
 * - 8 bytes: batch ID (random)
 * - 2 bytes: packet index (uint16 BE)
 * - 2 bytes: total packets (uint16 BE)
 * - remaining: JSON payload
 */
const HEADER_SIZE = 12;

function createBatchId(): Buffer {
    return randomBytes(8);
}

function createPacketHeader(batchId: Buffer, index: number, total: number): Buffer {
    const header = Buffer.alloc(HEADER_SIZE);
    batchId.copy(header, 0);
    header.writeUInt16BE(index, 8);
    header.writeUInt16BE(total, 10);
    return header;
}

function splitPayload(payload: Buffer, maxPayloadSize: number): Buffer[] {
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < payload.length; offset += maxPayloadSize) {
        chunks.push(payload.subarray(offset, Math.min(offset + maxPayloadSize, payload.length)));
    }
    return chunks;
}

export default async function transport(options: TransportOptions = {}): ReturnType<typeof build> {
    const opts = {...DEFAULT_OPTIONS, ...options};
    const socket = dgram.createSocket('udp4');
    let batch: string[] = [];
    let flushTimer: ReturnType<typeof setInterval> | null = null;

    async function sendBatch(entries: string[]): Promise<void> {
        if (entries.length === 0) return;

        const batchId = createBatchId();
        const payload = Buffer.from(JSON.stringify(entries));
        const maxPayloadSize = opts.maxPacketSize - HEADER_SIZE;
        const chunks = splitPayload(payload, maxPayloadSize);

        for (let i = 0; i < chunks.length; i++) {
            const header = createPacketHeader(batchId, i, chunks.length);
            const packet = Buffer.concat([header, chunks[i]]);
            socket.send(packet, 0, packet.length, opts.port, opts.host);
        }
    }

    function flush(): void {
        if (batch.length > 0) {
            const entries = batch;
            batch = [];
            sendBatch(entries).catch(() => {
                // Silently ignore send errors - log transport should not crash the app
            });
        }
    }

    function startFlushTimer(): void {
        if (!flushTimer) {
            flushTimer = setInterval(flush, opts.flushInterval);
            // Don't keep the process alive for the flush timer
            if (flushTimer.unref) flushTimer.unref();
        }
    }

    function stopFlushTimer(): void {
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
    }

    return build(
        async function (source) {
            startFlushTimer();

            for await (const obj of source) {
                const line = typeof obj === 'string' ? obj : JSON.stringify(obj);
                batch.push(line);

                if (batch.length >= opts.batchSize) {
                    flush();
                }
            }

            // Final flush on stream end
            flush();
            stopFlushTimer();
            socket.close();
        },
        {
            close: async () => {
                flush();
                stopFlushTimer();
                socket.close();
            },
        },
    );
}
