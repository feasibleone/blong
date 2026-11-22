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
    /**
     * The batches this writer could not send.
     *
     * Readable rather than only visible on stderr, because the caller that cares is usually a
     * *different* one: a test that points the writer at a port nothing listens on, or a tool that
     * reports why a process's records never arrived. A destination never breaks its caller, so this
     * is how a failure is still observable.
     */
    failures(): IUdpWriterFailures;
}

/** What a writer has seen go wrong: how often, and with what. */
export interface IUdpWriterFailures {
    /** How many batches failed outright — one count per failed send, not per record. */
    count: number;
    /** The last failure the socket reported. */
    last?: Error;
}

const DEFAULTS = {
    host: '127.0.0.1',
    port: 9999,
    batchSize: 10,
    flushInterval: 100,
    maxPacketSize: 65000,
};

/**
 * The code this writer's failures carry, so a reader — or the framework's warning reporter — can tell
 * a lost batch from any other runtime warning (`@@D-960`).
 */
export const LOG_DESTINATION_CODE = 'BLONG_LOG_DESTINATION';

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
    let failures = 0;
    let lastFailure: Error | undefined;
    /** The failure kinds already reported, so a broken destination does not write a line per batch. */
    const reported = new Set<string>();
    // A send is fire-and-forget, so the only way its failure arrives is the socket's own `error`
    // event — a name that does not resolve, a route that is gone. An emitter with no listener for it
    // *throws*, which turns "the collector is unreachable" into "the process that was logging exits";
    // the contract above says the opposite, so the event is consumed here.
    //
    // Consumed, and not discarded: a destination that silently receives nothing is a day nobody can
    // explain — the viewer was once pointed at a port no process sent to, and every layer of the
    // framework behaved exactly as documented (@@F-789 @@F-811). So the first failure of each
    // kind is reported on stderr, and every one is counted for a caller that asks.
    //
    // A warning event rather than a record: this writer is the log destination, and a record about its
    // own failure would go through it — the loop that ends with a process writing to itself forever.
    // The severity is still an error, because the batch is gone and nothing retries it: `type: 'Error'`
    // is what the terminal prints, and the framework's reporter writes the record at error level
    // (@@D-960).
    const note = (error: Error & {code?: string}): void => {
        failures += 1;
        lastFailure = error;
        const kind = error.code ?? error.message;
        if (reported.has(kind)) return;
        reported.add(kind);
        process.emitWarning(
            `the log destination ${settings.host}:${settings.port} refused a batch ` +
                `(${kind}: ${error.message}); records keep being written and these are lost ` +
                'until the destination answers',
            {code: LOG_DESTINATION_CODE, type: 'Error'},
        );
    };
    socket.on('error', note);
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
        } catch (error) {
            // A destination never breaks its caller, and a lost batch costs lines in a viewer. A send
            // that could not even be attempted is the same failure the socket event reports — a
            // socket closed under the batch, say — so it is counted and reported the same way rather
            // than dropped because it happened to arrive as a throw (@@F-811).
            note(error as Error);
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
        failures: () => ({count: failures, ...(lastFailure ? {last: lastFailure} : {})}),
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
