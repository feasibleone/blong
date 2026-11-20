/**
 * The transport: one reached call becomes one pino call, and the human line is a format of it.
 *
 * lukaot decides that a signal was emitted; pino writes it. JSON mode hands pino the structured
 * record — the identifier, the level, the params, the site and the ambient identity — and pino's own
 * serialisers and transports do the rest. Human mode keeps the coloured line readers of the old
 * logger recognised as a *formatter* over the same record, so the two modes cannot disagree about
 * what happened (`@@D-897`).
 *
 * Retention is the cache's: a record is retained under its signal (one entry per shape, plus the
 * record itself where folding would hide something), which is what makes the reference on the
 * printed line resolve after the process is gone.
 */

import pino, {type DestinationStream, type Logger} from 'pino';

import type {RecordStore} from './cache.ts';
import type {ISignalRecord} from './emit.ts';
import {levelValue} from './level.ts';
import type {LogRecord} from './record.ts';
import {mintRecordRef} from './refs.ts';
import type {SignalRegistry} from './registry.ts';
import {renderHuman} from './render.ts';

/** How a record is written. */
export type TransportFormat = 'human' | 'json';

/** What the transport needs. */
export interface ITransportOptions {
    /** The declaration and the policy, so a level is the one in force. */
    registry: SignalRegistry;
    /** `json` for a machine, `human` for a person; `human` by default. */
    format?: TransportFormat;
    /** ANSI colour in the human line. Off in a pipe, on at a terminal. */
    color?: boolean;
    /** Where the bytes go. Defaults to stdout; a test supplies its own. */
    destination?: DestinationStream;
    /** The retention store, when one is open. */
    store?: RecordStore;
    /** The clock, for the record id and a deterministic test. */
    now?: () => number;
}

/** What the transport answers. */
export interface ITransport {
    /** Write one record. */
    write(record: ISignalRecord): void;
    /** Flush what pino holds. */
    close(): Promise<void>;
}

/** The record as the renderer reads it: the old shape, filled from a signal record. */
export function toLogRecord(record: ISignalRecord): LogRecord {
    const id = mintRecordRef();
    return {
        id,
        time: record.time,
        level: levelValue(record.level as Parameters<typeof levelValue>[0]),
        levelName: record.level,
        msg: record.message,
        service: String(
            record.identity?.service ?? record.signal.split(/(?=[A-Z])/)[0] ?? 'lukaot',
        ),
        messageId: record.signal,
        operation: record.signal,
        refs: {
            ...(record.identity?.trace === undefined ? {} : {trace: String(record.identity.trace)}),
            ...(record.identity?.flow === undefined ? {} : {flow: String(record.identity.flow)}),
            ...(record.identity?.leg === undefined ? {} : {leg: String(record.identity.leg)}),
        },
    } as LogRecord;
}

/**
 * Build the transport.
 *
 * One pino instance per process: the level is set to `trace` so the record's own level is what
 * decides, and the naming is the signal's — a reader filtering a log by operation has the identifier
 * the vocabulary gave it.
 */
export function createTransport(options: ITransportOptions): ITransport {
    const {format = 'human', color = false, destination, store, now = Date.now} = options;
    let logger: Logger | undefined;
    const stream = (): DestinationStream => destination ?? pino.destination(1);

    const pinoFor = (): Logger => {
        logger ??= pino(
            {
                level: 'trace',
                base: undefined,
                timestamp: pino.stdTimeFunctions.epochTime,
                messageKey: 'line',
                formatters: {
                    level: label => ({level: label}),
                },
            },
            stream(),
        );
        return logger;
    };

    return {
        write(record) {
            if (format === 'human') {
                // The line is the whole of what a person reads, so it is written as it is rendered —
                // through pino's destination, which is what keeps one owner for the bytes — and no
                // structure is printed beside it.
                const line = renderHuman(toLogRecord(record), {
                    color,
                    formatTime: time => new Date(time).toISOString(),
                });
                stream().write(`${line}\n`);
            } else {
                pinoFor()[record.level]({
                    line: record.message,
                    signal: record.signal,
                    kind: record.kind,
                    ...(record.params === undefined ? {} : {params: record.params}),
                    ...(record.site === undefined ? {} : {site: record.site}),
                    ...(record.identity === undefined ? {} : {identity: record.identity}),
                    time: now(),
                });
            }
            if (store) {
                // Retention is a side effect of writing, not a second call: the record a reader
                // resolves is the record that was printed, folded into its shape.
                void store.put(toLogRecord(record)).catch(() => undefined);
            }
        },
        async close() {
            if (logger) await new Promise<void>(resolve => logger!.flush(() => resolve()));
        },
    };
}
