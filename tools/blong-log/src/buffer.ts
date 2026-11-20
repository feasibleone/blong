/**
 * Circular buffer for log entries with ULID-based ordering.
 */

import {monotonicFactory} from 'ulidx';
import {captureOf, contextOf, serviceOf, signalOf, traceOf} from './record.ts';
import type {FilterOptions, LogEntry} from './types.ts';
import {LEVEL_MAP, LEVEL_NAME} from './types.ts';

const ulid = monotonicFactory();

export class CircularBuffer {
    readonly #entries: LogEntry[];
    readonly #maxSize: number;
    #head: number = 0;
    #count: number = 0;

    constructor(maxSize: number = 10000) {
        this.#maxSize = maxSize;
        this.#entries = new Array(maxSize);
    }

    /**
     * Add a raw log object to the buffer, assigning a ULID.
     */
    add(raw: Record<string, unknown>): LogEntry {
        const entry = this.#normalize(raw);
        entry.id = ulid();

        this.#entries[this.#head] = entry;
        this.#head = (this.#head + 1) % this.#maxSize;
        if (this.#count < this.#maxSize) {
            this.#count++;
        }

        return entry;
    }

    /**
     * Get recent entries, optionally filtered.
     */
    getRecent(options: FilterOptions = {}): LogEntry[] {
        const limit = options.limit ?? 200;
        const entries = this.#orderedEntries();
        const filtered = options.after ? entries.filter(e => e.id > options.after!) : entries;

        return this.#applyFilters(filtered, options).slice(-limit);
    }

    /**
     * Get all entries matching filters.
     */
    query(options: FilterOptions = {}): LogEntry[] {
        const entries = this.#orderedEntries();
        return this.#applyFilters(entries, options);
    }

    /**
     * Current number of entries in buffer.
     */
    get size(): number {
        return this.#count;
    }

    /**
     * Clear all entries.
     */
    clear(): void {
        this.#head = 0;
        this.#count = 0;
    }

    #orderedEntries(): LogEntry[] {
        if (this.#count < this.#maxSize) {
            return this.#entries.slice(0, this.#count);
        }
        // Buffer is full, entries wrap around
        return [...this.#entries.slice(this.#head), ...this.#entries.slice(0, this.#head)];
    }

    #normalize(raw: Record<string, unknown>): LogEntry {
        const entry: LogEntry = {...raw, id: ''};

        // Normalize level to name
        if (typeof entry.level === 'number' && !entry.levelName) {
            entry.levelName = LEVEL_NAME[entry.level] ?? `level-${entry.level}`;
        } else if (typeof entry.level === 'string') {
            entry.levelName = entry.level;
            entry.level = LEVEL_MAP[entry.level] ?? 0;
        }

        // The trace is a lukaot record's `refs.trace`; the column, the filter and the search were
        // written for a top-level `traceId`. Read once here, so every reader downstream sees it under
        // the one spelling it already uses and a record that has none simply has none.
        entry.traceId = traceOf(entry);

        return entry;
    }

    #applyFilters(entries: LogEntry[], options: FilterOptions): LogEntry[] {
        let result = entries;

        // Filter by minimum log level
        if (options.level) {
            const minLevel = LEVEL_MAP[options.level] ?? 0;
            result = result.filter(e => (e.level ?? 0) >= minLevel);
        }

        // Filter by the port or component that reported it — the record's `fields.context` — falling
        // back to the service, which is what a suite-level reader used to filter by (@@D-926).
        if (options.name) {
            const name = options.name.toLowerCase();
            result = result.filter(e =>
                (contextOf(e) ?? serviceOf(e) ?? '').toLowerCase().includes(name),
            );
        }

        // Filter by the declared signal identifier.
        if (options.signal) {
            result = result.filter(e => signalOf(e) === options.signal);
        }

        // Filter by the capture shape that rendered a payload.
        if (options.capture) {
            result = result.filter(e => captureOf(e)?.shape === options.capture);
        }

        // Filter by trace ID
        if (options.traceId) {
            result = result.filter(e => e.traceId === options.traceId);
        }

        // Filter by error presence
        if (options.hasError) {
            result = result.filter(e => !!e.err);
        }

        // Filter by custom property values
        if (options.properties) {
            for (const [key, value] of Object.entries(options.properties)) {
                result = result.filter(e => String(e[key] ?? '') === value);
            }
        }

        // Free text search across all properties
        if (options.search) {
            const search = options.search.toLowerCase();
            result = result.filter(e => {
                const text = JSON.stringify(e).toLowerCase();
                return text.includes(search);
            });
        }

        return result;
    }
}
