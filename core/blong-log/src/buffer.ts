/**
 * Circular buffer for log entries with ULID-based ordering.
 */

import {monotonicFactory} from 'ulidx';
import type {FilterOptions, LogEntry} from './types.js';
import {LEVEL_MAP, LEVEL_NAME} from './types.js';

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

        return entry;
    }

    #applyFilters(entries: LogEntry[], options: FilterOptions): LogEntry[] {
        let result = entries;

        // Filter by minimum log level
        if (options.level) {
            const minLevel = LEVEL_MAP[options.level] ?? 0;
            result = result.filter(e => (e.level ?? 0) >= minLevel);
        }

        // Filter by service name
        if (options.name) {
            const name = options.name.toLowerCase();
            result = result.filter(
                e => typeof e.name === 'string' && e.name.toLowerCase().includes(name),
            );
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
