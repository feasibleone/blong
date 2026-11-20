/**
 * The callable surface a vocabulary becomes, over a writer the caller owns.
 *
 * A declaration is data — identifiers, messages, levels, the policy an operator may patch. What a call
 * site reaches is this: one function per identifier, which turns the values it was handed into a record
 * and hands the record to a writer. The two halves are separate on purpose, because a **vocabulary** is
 * one thing per process — its identifiers, the policy, the counters, the sites, the dependency edges —
 * and must stay one thing, or the coverage question ("which of the declared signals did this process
 * reach, and from where") has as many answers as there are components. What varies between components
 * is only where a record is *written*.
 *
 * So a component builds a view over its own writer and shares the registry: the watcher's line belongs
 * to the watcher's logger, a port's to the port's, a fixture participant's to that participant's. It is
 * the same shape as `logger.child({name})`, and for the same reason — context belongs to the binding,
 * not to the vocabulary.
 *
 * Nothing here knows what a component is: the framework's loader attaches one view per port
 * (`core/blong-gogo/src/signals.ts`), and a program that hosts participants of its own — the flow
 * fixtures in `flow/` — builds one per participant, which is what makes the fixtures a demonstration of
 * the vocabulary rather than of a logger.
 */

import type {ISignal} from './declare.ts';
import {createEmitter, type ISignalRecord} from './emit.ts';
import {createErrorEmitter} from './error.ts';
import {createSignalProxy, type ISignalProxy, type VocabularyProxy} from './proxy.ts';
import type {SignalRegistry} from './registry.ts';
import type {ISite} from './site.ts';

/** The little of a host this module needs: the level-bound logger it writes through. */
export interface ISignalHost {
    /**
     * A level-bound logger face, which is what a port holds: `log[level](bindings, message)`.
     *
     * One of this and {@link write} is enough. A port has the face; a log *implementation* has the
     * whole `ILog` and hands a writer instead, because it has no single face to offer — its own
     * `logger(level, bindings)` is what produces one.
     */
    log?: Partial<Record<ISignalRecord['level'], (bindings: object, message: string) => void>>;
    /** Where a record goes, when the host is not a level-bound logger. */
    write?: (record: ISignalRecord) => void;
    /** The vocabulary the host's code calls. */
    signal?: VocabularyProxy;
}

/** Where a record goes. */
export type SignalWriter = (record: ISignalRecord) => void;

/** Build the callable surface for one writer, over a registry the caller owns. */
export function signalView(registry: SignalRegistry, write: SignalWriter): ISignalProxy {
    const emitted = createEmitter({registry, write});
    const failed = createErrorEmitter({registry, write});
    return createSignalProxy({
        registry,
        emit: (signal: ISignal, params: unknown, site: ISite | undefined) =>
            // Which emitter runs is the declaration's kind, not the caller's choice: an error signal
            // answers the failure to throw, a log signal answers nothing.
            signal.kind === 'error' ? failed(signal, params, site) : emitted(signal, params, site),
    });
}

/** A writer that hands a record to a level-bound face — what a port and a child both do. */
export function writeThroughFace(face: ISignalHost['log']): SignalWriter {
    return record => {
        const line = face?.[record.level];
        if (typeof line !== 'function') return;
        line.call(face, signalBindings(record), record.message);
    };
}

/**
 * The bindings a line carries beside its message.
 *
 * The identifier first, because it is what a reader greps for, then the values as they were supplied.
 * Nothing is derived from the message: a reworded message is the same line.
 *
 * The envelope travels as `$meta`, which is where the framework's printer looks for it: it lifts
 * `mtid` and `method` onto the header line (`info watch.config.reload …`), so a record that declared
 * them must hand them over in that shape or the line loses two of its fields (`@@F-764`).
 */
export function signalBindings(record: ISignalRecord): object {
    const envelope =
        record.mtid === undefined && record.method === undefined
            ? undefined
            : {
                  ...(record.mtid === undefined ? {} : {mtid: record.mtid}),
                  ...(record.method === undefined ? {} : {method: record.method}),
              };
    return {
        signal: record.signal,
        ...(record.params === undefined ? {} : {params: record.params}),
        ...(envelope === undefined ? {} : {$meta: envelope}),
    };
}
