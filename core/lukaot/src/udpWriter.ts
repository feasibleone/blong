/**
 * A writer that sends records to a collector over UDP, and the framework's own one.
 *
 * It belongs here, beside the writer contract and the record shape, rather than in the viewer that
 * happens to read it: a process must be able to send its records somewhere without depending on the
 * tool that displays them, and a tool is free to move inside this package later (`@@D-930`). The
 * configuration names it with `log.destination: {host, port}` — the loader builds this writer when the
 * block names no module — so the common case needs no package name at all.
 *
 * ```ts
 * import {createUdpWriter, setWriter} from '@feasibleone/lukaot/node';
 *
 * setWriter(createUdpWriter({port: 9999}));
 * ```
 *
 * The **record** is what goes on the wire, not the rendered line: the line is a rendering for a
 * terminal, and a collector that had only the line could show the sentence but none of the fields a
 * capture row draws. A caller that writes without a record is sent as a line of its own, so nothing is
 * silently dropped.
 */

import dgram from 'node:dgram';

import {sendBatch, type IBatchTarget} from './packets.ts';
import type {LogRecord} from './record.ts';
import type {Writer} from './writer.ts';

export interface IUdpWriterOptions {
    /** Where the collector listens (default: `127.0.0.1`). */
    host?: string;
    /** The collector's UDP port (default: `9999`). */
    port?: number;
    /** Records per batch (default: `10`). */
    batchSize?: number;
    /** How long a partial batch may wait, in milliseconds (default: `100`). */
    flushInterval?: number;
    /** Largest packet to send (default: `65000`). */
    maxPacketSize?: number;
}

/** A writer that batches, plus the two verbs a process needs to stop cleanly. */
export interface IUdpWriter extends Writer {
    /** Send what is queued now. */
    flush(): void;
    /** Flush and close the socket; safe to call twice. */
    close(): void;
}

const DEFAULTS = {
    host: '127.0.0.1',
    port: 9999,
    batchSize: 10,
    flushInterval: 100,
    maxPacketSize: 65000,
};

/**
 * A writer that ships records to a collector over UDP.
 *
 * The batch and the send are fire-and-forget: a write never waits on the network and never throws, so
 * a collector that is down costs the lines it did not receive and nothing else. The flush timer is
 * `unref`d, because a log destination must not be the reason a process stays alive.
 */
export function createUdpWriter(options: IUdpWriterOptions = {}): IUdpWriter {
    const settings = {...DEFAULTS, ...options};
    const target: IBatchTarget = {
        host: settings.host,
        port: settings.port,
        maxPacketSize: settings.maxPacketSize,
    };
    const socket = dgram.createSocket('udp4');
    // A send is fire-and-forget, so the only way its failure arrives is the socket's own `error`
    // event — a name that does not resolve, a route that is gone. An emitter with no listener for it
    // *throws*, which turns "the collector is unreachable" into "the process that was logging exits";
    // the contract above says the opposite, so the event is consumed here and the batch is what it
    // costs (`@@F-789`).
    socket.on('error', () => undefined);
    // The socket is `unref`d for the same reason the timer is: an open handle is enough to keep the
    // event loop alive, and a destination that did would turn every run into one that never exits —
    // a test suite that finishes its work and then waits to be killed (`@@D-930`).
    socket.unref?.();
    let batch: string[] = [];
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const flush = (): void => {
        if (batch.length === 0) return;
        const lines = batch;
        batch = [];
        try {
            sendBatch(socket, lines, target);
        } catch {
            // A destination never breaks its caller, and a lost batch costs lines in a viewer.
        }
    };

    const start = (): void => {
        if (timer !== undefined) return;
        timer = setInterval(flush, settings.flushInterval);
        timer.unref?.();
    };

    return {
        write(line: string, record?: LogRecord): void {
            if (closed) return;
            start();
            // The record is the structured line; the rendered one is the fallback for a caller that has
            // none. A string record would double-encode, so it is treated as a line.
            batch.push(
                record === undefined || record === null
                    ? JSON.stringify(line)
                    : JSON.stringify(record),
            );
            if (batch.length >= settings.batchSize) flush();
        },
        flush,
        close(): void {
            if (closed) return;
            flush();
            closed = true;
            if (timer !== undefined) clearInterval(timer);
            timer = undefined;
            socket.close();
        },
    };
}
