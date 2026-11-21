/**
 * UDP receiver that reassembles batched log entries.
 */

import {HEADER_SIZE} from '@feasibleone/lukaot/node';
import dgram from 'node:dgram';
import {EventEmitter} from 'node:events';

/** Pending batch being reassembled */
interface PendingBatch {
    chunks: Map<number, Buffer>;
    totalPackets: number;
    receivedAt: number;
}

export interface UdpReceiverOptions {
    port?: number;
    host?: string;
    /** Timeout for incomplete batches in ms (default: 5000) */
    batchTimeout?: number;
}

export class UdpReceiver extends EventEmitter {
    readonly #port: number;
    readonly #host: string;
    readonly #batchTimeout: number;
    readonly #pendingBatches: Map<string, PendingBatch> = new Map();
    #socket: dgram.Socket | null = null;
    #cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(options: UdpReceiverOptions = {}) {
        super();
        this.#port = options.port ?? 9999;
        this.#host = options.host ?? '127.0.0.1';
        this.#batchTimeout = options.batchTimeout ?? 5000;
    }

    async start(): Promise<void> {
        this.#socket = dgram.createSocket('udp4');

        this.#socket.on('message', (msg: Buffer) => {
            this.#handlePacket(msg);
        });

        // A socket that emits `error` with no listener throws out of the emitter, and that is what a
        // taken port did: a container whose listener was already bound elsewhere died with
        // `EADDRINUSE` from an unhandled event instead of the adapter's `start` failing. The error is
        // reported twice by design — a rejected promise for whoever asked to start, and an `error`
        // event for whoever subscribed — but a caller that subscribed to neither is not killed by it
        // (`@@F-788`).
        this.#socket.on('error', (err: Error) => {
            if (this.listenerCount('error') > 0) this.emit('error', err);
        });

        return new Promise<void>((resolve, reject) => {
            const onError = (err: Error): void => reject(err);
            this.#socket!.once('error', onError);
            this.#socket!.bind(this.#port, this.#host, () => {
                // The bind's own listener goes with the bind: a later error is the running
                // receiver's to report, and a `once` left attached would swallow the first one.
                this.#socket?.removeListener('error', onError);
                this.#startCleanup();
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        this.#stopCleanup();
        if (this.#socket) {
            const socket = this.#socket;
            this.#socket = null;
            return new Promise<void>(resolve => {
                try {
                    socket.close(() => resolve());
                } catch {
                    // A socket whose bind failed is not running, and closing one is an error; a stop
                    // after a failed start is the caller cleaning up, not a second failure.
                    resolve();
                }
            });
        }
    }

    #handlePacket(msg: Buffer): void {
        if (msg.length < HEADER_SIZE) return;

        const batchId = msg.subarray(0, 8).toString('hex');
        const packetIndex = msg.readUInt16BE(8);
        const totalPackets = msg.readUInt16BE(10);
        const payload = msg.subarray(HEADER_SIZE);

        let batch = this.#pendingBatches.get(batchId);
        if (!batch) {
            batch = {
                chunks: new Map(),
                totalPackets,
                receivedAt: Date.now(),
            };
            this.#pendingBatches.set(batchId, batch);
        }

        batch.chunks.set(packetIndex, payload);

        // Check if batch is complete
        if (batch.chunks.size === batch.totalPackets) {
            this.#pendingBatches.delete(batchId);
            this.#reassembleBatch(batch);
        }
    }

    #reassembleBatch(batch: PendingBatch): void {
        // Reassemble chunks in order
        const chunks: Buffer[] = [];
        for (let i = 0; i < batch.totalPackets; i++) {
            const chunk = batch.chunks.get(i);
            if (!chunk) return; // Missing chunk, discard
            chunks.push(chunk);
        }

        const payload = Buffer.concat(chunks);

        try {
            const entries = JSON.parse(payload.toString('utf-8'));
            if (Array.isArray(entries)) {
                for (const entry of entries) {
                    try {
                        const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
                        this.emit('entry', parsed);
                    } catch {
                        // Skip malformed entries
                    }
                }
            }
        } catch {
            // Skip malformed batch payload
        }
    }

    #startCleanup(): void {
        this.#cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [id, batch] of this.#pendingBatches) {
                if (now - batch.receivedAt > this.#batchTimeout) {
                    this.#pendingBatches.delete(id);
                }
            }
        }, this.#batchTimeout);
        if (this.#cleanupTimer.unref) this.#cleanupTimer.unref();
    }

    #stopCleanup(): void {
        if (this.#cleanupTimer) {
            clearInterval(this.#cleanupTimer);
            this.#cleanupTimer = null;
        }
    }
}
