import {Type, type TNumberOptions, type TSchemaOptions, type TStringOptions} from 'typebox';
import {monotonicFactory} from 'ulidx';
import _merge from 'ut-function.merge';
import {v4, v7} from 'uuid';
import _yaml from 'yaml';

// Core logic to merge two types (T is target, U is source/override)
type DeepMerge<T, U> = T extends object
    ? U extends object
        ? {
              [K in keyof T | keyof U]: K extends keyof T
                  ? K extends keyof U
                      ? DeepMerge<T[K], U[K]> // Recursively merge shared keys
                      : T[K]
                  : K extends keyof U
                    ? U[K]
                    : never;
          }
        : U
    : U;

// Variadic type to process N arguments
type DeepMergeAll<Ts extends readonly unknown[]> = Ts extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly []
        ? Head
        : DeepMerge<Head, DeepMergeAll<Tail>>
    : unknown;

/**
 * Checks if a value is a plain object (not null, not an array).
 */
function isObject(item: unknown): item is Record<string | symbol, unknown> {
    return item !== null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deeply merges source into target in-place, supporting Symbol keys.
 * Note: This mutates the target object.
 */
export function mergeWithSymbols<T extends object, U extends object>(
    target: T,
    source: U,
): DeepMergeAll<[T, U]> {
    if (source == null) return target as DeepMergeAll<[T, U]>;

    // Guard against null/undefined targets
    const dest = (target || {}) as Record<string | symbol, unknown>;

    for (const key of Reflect.ownKeys(source)) {
        const sourceValue = (source as Record<string | symbol, unknown>)[key];
        const targetValue = dest[key];

        if (isObject(targetValue) && isObject(sourceValue)) {
            // Recursively merge nested plain objects
            mergeWithSymbols(targetValue, sourceValue);
        } else if (sourceValue !== undefined) {
            // Assign primitives, arrays, or new objects directly
            dest[key] = sourceValue;
        }
    }

    return dest as DeepMergeAll<[T, U]>;
}

export const ulid: ReturnType<typeof monotonicFactory> = monotonicFactory();

function isSafeKey(key: string): boolean {
    return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

export function setProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
    if (!path) return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!isSafeKey(part)) return;
        if (current[part] == null || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    const lastPart = parts[parts.length - 1];
    if (isSafeKey(lastPart)) {
        current[lastPart] = value;
    }
}

// export default {merge, mergeWithSymbols, ulid, uuid4, uuid7, yaml, setProperty};

export const uuid4 = v4;
export const uuid7 = v7;
export const yaml = _yaml;
export const merge = _merge;

const _dateTime = () =>
    Type.Codec(Type.String({format: 'date-time'}))
        .Decode(value => new Date(value))
        .Encode(value => value.toISOString());

const _date = () =>
    Type.Codec(Type.String({format: 'date-time'}))
        .Decode(value => new Date(value))
        .Encode(value => value.toISOString().split('T')[0]);

export const type = {
    ...Type,
    // Convenience functions for common SQL column types
    increment: () =>
        Type.Optional(
            Type.Union([
                Type.Null(),
                Type.BigInt({readonly: true, default: 'auto-increment'}),
                Type.Integer({readonly: true, default: 'auto-increment'}),
            ]),
        ),
    integerNull: (options?: TNumberOptions) =>
        Type.Optional(Type.Union([Type.Null(), Type.Integer(options)])),
    integerNotNull: (options?: TNumberOptions) => Type.Integer(options),
    bigIntNull: (options?: TNumberOptions) =>
        Type.Optional(
            Type.Union([
                Type.Null(),
                Type.BigInt(options),
                Type.Integer(options),
                Type.String({pattern: '^-?\\d+$'}),
            ]),
        ),
    bigIntNotNull: (options?: TNumberOptions) =>
        Type.Union([
            Type.BigInt(options),
            Type.Integer(options),
            Type.String({pattern: '^-?\\d+$'}),
        ]),
    stringNull: (options?: TStringOptions) =>
        Type.Optional(Type.Union([Type.Null(), Type.String(options)])),
    stringNotNull: (options?: TStringOptions) => Type.String(options),
    numberNull: (options?: TNumberOptions) =>
        Type.Optional(Type.Union([Type.Null(), Type.Number(options)])),
    numberNotNull: (options?: TNumberOptions) => Type.Number(options),
    booleanNull: (options?: TSchemaOptions) =>
        Type.Optional(
            Type.Union([Type.Null(), Type.Boolean(options), type.Literal(0), type.Literal(1)]),
        ),
    booleanNotNull: (options?: TSchemaOptions) =>
        Type.Union([Type.Null(), Type.Boolean(options), type.Literal(0), type.Literal(1)]),
    dateNull: () => Type.Optional(Type.Union([Type.Null(), _date()])),
    dateNotNull: () => _date(),
    dateTimeNull: () => Type.Optional(Type.Union([Type.Null(), _dateTime()])),
    dateTimeNotNull: () => _dateTime(),
    ulid: () => Type.Optional(Type.Union([Type.Null(), Type.String({default: 'ulid'})])),
    uuid: () => Type.Optional(Type.Union([Type.Null(), Type.String({default: 'uuid'})])),
    uidNull: () => Type.Optional(Type.Union([Type.Null(), Type.String({format: 'uid'})])),
    uidNotNull: () => Type.String({format: 'uid'}),
};

export const rename = (object: object, value: string) =>
    Object.defineProperty<unknown>(object, 'name', {value});
export const group =
    (name: string, config?: {autoSnapshot?: boolean; mask?: string[]}) => (steps: unknown[]) => {
        Object.defineProperty(steps, 'name', {
            value: name,
            enumerable: false,
            writable: true,
        });
        if (config?.autoSnapshot !== undefined)
            Object.defineProperty(steps, 'autoSnapshot', {
                value: config.autoSnapshot,
                enumerable: false,
                writable: true,
            });
        if (config?.mask !== undefined)
            Object.defineProperty(steps, 'mask', {
                value: config.mask,
                enumerable: false,
                writable: true,
            });
        return steps;
    };
/**
 * Create a **snapshot marker** — an array of step names placed inside a `group()` steps
 * array, marking where the test context is snapshotted into the TAP context.
 *
 * Named `snapshot`, not `checkpoint`: a *checkpoint* is the progress point a running
 * handler reports (`$meta.checkpoint`, `lib.checkpoint`), which is unrelated to a test's
 * snapshot, and one word for two things is how they came to read as one.
 *
 * - `snapshot('name')`           — one marker, snapshot the full context
 * - `snapshot('name', 'a', 'b')` — one marker per phase, only those steps snapshotted
 *
 * A bare `[]` is neither: it is a sync barrier, which waits without snapshotting.
 */
export const snapshot = (name: string, ...markers: string[]) => {
    const arr: string[] = markers.length > 0 ? [...markers] : ['*'];
    return Object.assign(arr, {name});
};

// Code from https://github.com/perry-mitchell/ulidx/blob/main/source/crockford.ts
// cSpell:disable-next-line
const B32_CHARACTERS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function crockfordEncode(input: Uint8Array): string {
    const output = [];
    let bitsRead = 0;
    let buffer = 0;
    const reversedInput = new Uint8Array(input.slice().reverse());
    for (const byte of reversedInput) {
        buffer |= byte << bitsRead;
        bitsRead += 8;
        while (bitsRead >= 5) {
            output.unshift(buffer & 0x1f);
            buffer >>>= 5;
            bitsRead -= 5;
        }
    }
    if (bitsRead > 0) {
        output.unshift(buffer & 0x1f);
    }
    return output.map(byte => B32_CHARACTERS.charAt(byte)).join('');
}

export function crockfordDecode(input: string): Uint8Array {
    const sanitizedInput = input.toUpperCase().split('').reverse().join('');
    const output = [];
    let bitsRead = 0;
    let buffer = 0;
    for (const character of sanitizedInput) {
        const byte = B32_CHARACTERS.indexOf(character);
        if (byte === -1) {
            throw new Error(`Invalid base 32 character found in string: ${character}`);
        }
        buffer |= byte << bitsRead;
        bitsRead += 5;
        while (bitsRead >= 8) {
            output.unshift(buffer & 0xff);
            buffer >>>= 8;
            bitsRead -= 8;
        }
    }
    if (bitsRead >= 5 || buffer > 0) {
        output.unshift(buffer & 0xff);
    }
    return new Uint8Array(output);
}

/**
 * How long a step may take before it is reported, when the caller names no
 * margin. One second is the framework's answer to "no step of a well-behaved
 * start is this slow": it is long enough that an ordinary operation never
 * reaches it, and short enough that a slow one is named while a person is still
 * looking at the terminal rather than after the process has finished.
 */
export const SLOW_STEP_MS = 1_000;

/**
 * The longest gap between the reports of one step.
 *
 * The gap doubles after every report, so a step that has been running for ten
 * minutes is reported once every five minutes rather than once every five
 * seconds: a long operation should say it is alive, not bury the log it is meant
 * to explain.
 */
export const MAX_PROGRESS_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Progress reporting for long-running async operations.
 *
 * Some operations (schema sync, seed data, procedure sync, external calls) can
 * take a long time, and it is hard to tell whether the process is stuck or
 * just slow. `withProgress` wraps a promise and, once the operation has run
 * past a threshold, logs a progress snapshot via a `getProgress` callback — the
 * first when the threshold is crossed, and each later one after twice the gap of
 * the one before it, up to `MAX_PROGRESS_INTERVAL_MS`. A final line reports the
 * total elapsed time.
 *
 * ## A slow step is a warning
 *
 * An operation that finishes later than `slowMs` is *unexpected*: nothing in the
 * framework is designed to take that long, and the last time one did the cost
 * turned out to be a defect (the log cache's index growing a file per record).
 * The completion of such a step is therefore logged at `warn` level, with the
 * elapsed time and whatever `getProgress` can say about it, instead of the
 * `info` line a merely slow operation gets. A step that also crossed
 * `thresholdMs` reports while it runs — which is what makes a long silence
 * readable as work rather than a hang — and its completion line is the same
 * warning.
 *
 * The logger is intentionally duck-typed (`{info, warn}`) so any framework
 * logger (server `Log`, browser `BrowserLog`, or a plain test logger) can be
 * used. Browser-safe: `timer.unref` is optional-chained.
 */
export interface WithProgressOptions {
    /** Called periodically after the threshold to produce a progress snapshot. */
    getProgress?: () => string | object;
    /**
     * Only start reporting after this many ms. Defaults to `slowMs`, so that a
     * step which is slow enough to warn about is also slow enough to report on
     * while it runs.
     */
    thresholdMs?: number;
    /**
     * The gap before the second report. Each report doubles the gap for the one
     * after it, up to `MAX_PROGRESS_INTERVAL_MS`. Defaults to 5 000.
     */
    intervalMs?: number;
    /** Log level used for the "still running" lines. Defaults to 'warn'. */
    level?: 'info' | 'warn';
    /**
     * A step that takes at least this long is reported at `warn` level when it
     * finishes. `0` disables the warning, leaving only the periodic reporting.
     * Defaults to `SLOW_STEP_MS`.
     */
    slowMs?: number;
}

type ProgressLogger = {info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void};

/**
 * Run `promise`, reporting it while it runs and warning when it was slow.
 *
 * Returns the promise's resolved value unchanged; a rejected promise is
 * propagated as-is.
 */
export async function withProgress<T>(
    log: ProgressLogger | undefined,
    label: string,
    promise: Promise<T>,
    {
        getProgress,
        intervalMs = 5_000,
        level = 'warn',
        slowMs = SLOW_STEP_MS,
        thresholdMs = slowMs,
    }: WithProgressOptions = {},
): Promise<T> {
    if (!log) return promise;
    const started = Date.now();
    let reported = false;
    const report = (): void => {
        const elapsedMs = Date.now() - started;
        if (elapsedMs < thresholdMs) return;
        reported = true;
        const progress = getProgress ? getProgress() : undefined;
        const emit = level === 'warn' ? log.warn : log.info;
        emit?.({label, elapsedMs, progress}, `operation "${label}" still running (${elapsedMs}ms)`);
    };
    // The reports thin out as the step goes on. The first comes when the step
    // crosses the threshold, which is when a person starts wondering whether the
    // process is stuck; each later one comes after twice the gap of the one before
    // it, up to `MAX_PROGRESS_INTERVAL_MS`. A step that runs for an hour must not
    // produce a line every five seconds — that is the excessive logging this
    // reporting would otherwise be, and it buries the log the report is in.
    let gapMs = intervalMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
        timer = setTimeout(() => {
            report();
            gapMs = Math.min(gapMs * 2, MAX_PROGRESS_INTERVAL_MS);
            schedule();
        }, gapMs);
        timer.unref?.();
    };
    const first = setTimeout(() => {
        report();
        schedule();
    }, thresholdMs);
    first.unref?.();
    try {
        return await promise;
    } finally {
        clearTimeout(first);
        if (timer) clearTimeout(timer);
        const elapsedMs = Date.now() - started;
        if (slowMs > 0 && elapsedMs >= slowMs) {
            // The step took longer than anything expects to take. Warn rather
            // than inform: this line is how a delayed start names the step that
            // delayed it, and a warning is not filtered out of a quiet log.
            const progress = getProgress ? getProgress() : undefined;
            log.warn?.({label, elapsedMs, progress}, `operation "${label}" took ${elapsedMs}ms`);
        } else if (reported) {
            log.info?.({label, elapsedMs}, `operation "${label}" completed in ${elapsedMs}ms`);
        }
    }
}
