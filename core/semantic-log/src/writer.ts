/**
 * Output destination (§5.1 parity rows "Test-time silencing, capture and
 * assertion" and "Multiple sinks in parallel"; PRD R18).
 *
 * Swapping the writer is how a test silences output and how a later sink is
 * added — the logger never branches on the destination. Until a writer is
 * installed the destination is stdout, so zero-configuration usage emits with
 * no setup at all; installing `null` silences output explicitly.
 *
 * A destination is handed the rendered line *and* the record it was rendered
 * from. The line is what a terminal or a file wants; the record is what a
 * structured sink needs, because a record cannot be recovered from a
 * human-rendered line and `human` is the emitter's default format — a sink that
 * had only the line would be inert unless the caller also switched the format
 * (see `service/transport.ts`). The second argument is optional, and a
 * line-only destination simply ignores it, so every existing writer is
 * unchanged.
 */

import type {LogRecord} from './record.ts';

export interface Writer {
    write(line: string, record?: LogRecord): void;
}

export const stdoutWriter: Writer = {
    write(line: string): void {
        process.stdout.write(line);
    },
};

export const stderrWriter: Writer = {
    write(line: string): void {
        process.stderr.write(line);
    },
};

/**
 * `undefined` means "never installed": the destination defaults to stdout so
 * zero-configuration usage works. `null` is an explicit choice to silence, and
 * must not fall back to stdout.
 */
let active: Writer | null | undefined = undefined;

/** Replace the destination. `null` silences output. */
export function setWriter(writer: Writer | null): void {
    active = writer;
}

/** The current destination, or `null` when silenced. */
export function getWriter(): Writer | null {
    return active === undefined ? stdoutWriter : active;
}

/**
 * Write the same line (and the same record) to every destination, in order, and
 * let no single destination break the others or the caller.
 *
 * This is R18's "a logging call never waits on, or fails because of, a sink"
 * extended to N sinks: each write is isolated, so a sink that throws — a full
 * disk, a closed stream, a broken transport — costs its own copy of the line
 * and nothing else. The failure is swallowed rather than reported here; a sink
 * that can say something useful about a failed delivery reports it itself (see
 * `service/transport.ts`, ruling D3).
 */
export function createFanoutWriter(writers: readonly Writer[]): Writer {
    return {
        write(line: string, record?: LogRecord): void {
            for (const writer of writers) {
                try {
                    writer.write(line, record);
                } catch {
                    // Swallowed by design: one destination must not suppress the
                    // rest of the fan-out, and must not escape into the log call.
                }
            }
        },
    };
}
