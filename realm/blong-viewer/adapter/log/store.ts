import {library} from '@feasibleone/blong';
import {CircularBuffer} from '@feasibleone/blong-log/buffer';
import type {FilterOptions, LogEntry} from '@feasibleone/blong-log/types';
import {UdpReceiver, type UdpReceiverOptions} from '@feasibleone/blong-log/udp-receiver';

/**
 * adapter/log/store.ts — the records this realm holds (`@@D-946`).
 *
 * The realm has no database: a process writes each record to `log.destination`
 * over UDP, this adapter reassembles the batch and keeps the entries in a
 * bounded buffer in memory, and the gateway reads what the buffer holds. The
 * buffer is the whole store, so a restart starts from nothing — the trade
 * `@@D-946` records, and the reason `/` answers with what it holds rather than
 * claiming a history it never had.
 *
 * Reused rather than copied: `CircularBuffer` and `UdpReceiver` are the ones
 * `tools/blong-log` serves its standalone viewer from, so a record reads the
 * same way in a portal page and in that viewer (`@@D-946`).
 *
 * The store is a module-level singleton because there is exactly one UDP
 * listener per process — a second buffer would be a buffer nothing writes to.
 * The adapter opens it in `start()` and closes it in `stop()`; a handler that
 * runs before either reads an empty one instead of throwing, because "no
 * records yet" is a true answer and an error at boot reads like a fault.
 */

/** What a reader may ask the buffer, as the viewer tool's own filter type. */
export type {FilterOptions, LogEntry};

/** The records one process has received, newest last. */
export interface IViewerStore {
    /** How many records the buffer can hold before the oldest is dropped. */
    readonly capacity: number;
    /** How many records it holds now. */
    readonly size: number;
    /** Add one record and answer the entry it became, with its assigned id. */
    add(raw: Record<string, unknown>): LogEntry;
    /** The most recent entries, newest last — what a reader polls (`after`). */
    recent(filters?: FilterOptions): LogEntry[];
    /** Everything the buffer holds that matches, not just the recent window. */
    query(filters?: FilterOptions): LogEntry[];
    /** The id of the newest record, or `undefined` while the buffer is empty. */
    last(): string | undefined;
    /**
     * Be told about each record as it arrives, and answer the function that stops
     * being told (`@@D-948`).
     *
     * This is what a subscription stands on: the wake a reader waits for is one of
     * these, so the listener says *that* something arrived and the reader asks for
     * it through `recent` — the frame carries a cursor, never a record.
     */
    onRecord(listener: (entry: LogEntry) => void): () => void;
}

class ViewerStore implements IViewerStore {
    readonly #buffer: CircularBuffer;
    readonly #capacity: number;
    readonly #listeners = new Set<(entry: LogEntry) => void>();

    constructor(capacity: number) {
        this.#capacity = capacity;
        this.#buffer = new CircularBuffer(capacity);
    }

    get capacity(): number {
        return this.#capacity;
    }

    get size(): number {
        return this.#buffer.size;
    }

    add(raw: Record<string, unknown>): LogEntry {
        const entry = this.#buffer.add(raw);
        for (const listener of this.#listeners) {
            try {
                listener(entry);
            } catch {
                // A listener that throws is one subscriber's problem; the record
                // is already stored, and the others have not been told yet.
            }
        }
        return entry;
    }

    recent(filters: FilterOptions = {}): LogEntry[] {
        return this.#buffer.getRecent(filters);
    }

    query(filters: FilterOptions = {}): LogEntry[] {
        return this.#buffer.query(filters);
    }

    last(): string | undefined {
        if (this.#buffer.size === 0) return undefined;
        return this.#buffer.getRecent({limit: 1})[0]?.id;
    }

    onRecord(listener: (entry: LogEntry) => void): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }
}

/** The default a buffer opens at when nothing says otherwise. */
export const DEFAULT_CAPACITY = 10000;

let store: ViewerStore | null = null;
let receiver: UdpReceiver | null = null;

/**
 * The one store of this process, opened at `capacity` the first time.
 *
 * A later call does not resize an open store: the records it already holds
 * were placed against the old width, and re-opening it would silently drop
 * them. The adapter opens it first, so the configured capacity is the one a
 * served process gets.
 */
export function storeOf(capacity: number = DEFAULT_CAPACITY): IViewerStore {
    store ??= new ViewerStore(capacity);
    return store;
}

/** Bind the UDP listener and feed every record it reassembles into the store. */
export async function openReceiver(options: UdpReceiverOptions): Promise<void> {
    if (receiver) return;
    const target = storeOf();
    receiver = new UdpReceiver(options);
    receiver.on('entry', (raw: Record<string, unknown>) => target.add(raw));
    await receiver.start();
}

/** Release the UDP port. Idempotent, so a failed start can still be stopped. */
export async function closeReceiver(): Promise<void> {
    const open = receiver;
    receiver = null;
    if (!open) return;
    open.removeAllListeners();
    await open.stop();
}

export type ViewerStoreLib = {
    store: typeof storeOf;
};

export default library(
    (): ViewerStoreLib => ({
        store: storeOf,
    }),
);
