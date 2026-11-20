/**
 * The declaration: what a realm, a layer or a library says it may emit.
 *
 * A vocabulary entry is one identifier — `agentTicketNotFound`, `agentTicketSkipped` — and that
 * identifier is the record's identity (`@@D-889`). Everything else about the entry is what a call
 * supplies or what an operator may override: the message a person reads, the level a log is written
 * at, the status an error answers with. Nothing is derived from a message's text, so a reworded
 * message is the same signal and two different sentences at one call site have to be two entries.
 *
 * The identifier is an object-literal property, so nothing is quoted, and a dot or any other
 * character that is not part of a camelCase token is refused: the whole point is that one search
 * finds the declaration, the call sites, the policy override and the record (`@@D-889`).
 *
 * ```ts
 * export default declare({
 *     log: {
 *         agentTicketSkipped: {level: 'warn', message: 'ticket {ticketId} was not claimed: {reason}'},
 *     },
 *     error: {
 *         agentTicketNotFound: {message: 'Ticket {ticketId} is not in the pool', statusCode: 404},
 *     },
 * });
 * ```
 */

import type {IMask} from './capture.ts';
import {captureSite, describeSite, type ISite} from './site.ts';

/** The levels a declaration may name, in the order a threshold compares them. */
export const LEVEL_NAMES = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

/** One of {@link LEVEL_NAMES}. */
export type LevelName = (typeof LEVEL_NAMES)[number];

/** The identifier grammar: a camelCase token, which is what makes it searchable without quotes. */
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

/**
 * The older spelling, `?name?`, which one realm writes today.
 *
 * `realm/blong-agent` declares fourteen of them and the framework never interpolated the form, so
 * every one of its messages prints the placeholder rather than the value. Accepting it here is what
 * lets that realm's conversion repair the messages instead of carrying the defect into the
 * vocabulary (`@@D-890`).
 */
const QUESTION_PLACEHOLDER = /\?([A-Za-z][A-Za-z0-9]*)\?/g;

/** A log signal as it is declared. */
export interface ILogEntry {
    /** The message a person reads, with `{placeholder}` names for its values. */
    message: string;
    /** The level the policy starts from; an operator may raise or silence it. */
    level?: LevelName;
    /** Whether the signal is emitted at all. */
    enabled?: boolean;
    /** The fraction of calls that are recorded, `1` by default. */
    sample?: number;
    /**
     * The record's kind in the framework's envelope — `event` for something that happened to the
     * process, absent for an ordinary line.
     *
     * Declared here rather than passed at the call site because it is a property of the *declaration*:
     * every call of one identifier is the same kind of event. The framework's printer lifts it onto the
     * header line, so it is visible output — `info watch.config.reload` — and a conversion that dropped
     * it would silently change what a reader sees (`@@F-764`).
     */
    mtid?: string;
    /**
     * The method the record is about, shown beside the kind — `watch.config.reload`.
     *
     * Interpolated with the same `{placeholders}` the message uses, because some names are only known
     * at the call site: a file watcher reports `watch.reload.{event}`, and the event is the value.
     */
    method?: string;
}

/** An error signal as it is declared. */
export interface IErrorEntry {
    /** The message the log and the failure both carry. */
    message: string;
    /** The wording a person is shown when the failure reaches a screen. */
    print?: string;
    /** The HTTP status a gateway answers with. */
    statusCode?: number;
    /** Control flow rather than a fault: constructed and thrown, but not recorded by default. */
    silent?: boolean;
    /** The level the record is written at when it is recorded; `error` by default. */
    level?: LevelName;
}

/**
 * A decision as it is declared: what the choice is about, and the arms it offers.
 *
 * A decision is not a signal — it emits nothing, and its record is the rationale a *later* record
 * carries — but its name has the same problem a signal's name had: a literal in a call site is
 * invisible to everything that wants to reason about it. Declared, the discriminator is one search
 * away from its call sites, its arms are a closed set the compiler checks, and the sentence that
 * explains an arm travels beside it instead of living in a docs page that drifts (`@@D-914`).
 *
 * The **arm names** are the labels a diagram draws (`alt` / `else`), so they are identifiers too:
 * camelCase, no punctuation, greppable.
 */
export interface IDecisionEntry {
    /** What the choice is about, in the sentence a reader wants. */
    message?: string;
    /** Its arms, by name, each with the note that says what taking it means. */
    branch: Record<string, string>;
    /**
     * Whether the rationale is recorded at all. `true` by default.
     *
     * A hot path can switch one decision's recording off without touching the code and without
     * changing what it decides: the branch still runs, and only what is *said* about it stops
     * (`@@D-914`).
     */
    enabled?: boolean;
}

/** A declared decision, with the fields that make it callable. */
export interface IDecision extends IDecisionEntry {
    kind: 'decision';
    id: string;
}

/** What a declaration holds: the kinds, each keyed by identifier. */
/**
 * A capture as it is declared: which shape renders it, at which rung, with what note.
 *
 * A capture is the third kind beside a log and an error signal, and it differs from both in one
 * important way: its *message* is optional and is never interpolated with the payload's fields. The
 * payload is not a placeholder — a capture's sentence says what the record is (`http exchange`), and
 * the shape's own summary says what happened to it. Its `level` is a rung of the shape's ladder, not a
 * severity: `line`, `headers`, `body`, `full` (`@@D-906`).
 */
export interface ICaptureEntry {
    /** The shape that renders it — `http.exchange`, `tcp.frame`, `json`, or one a realm registered. */
    shape: string;
    /** The rung it starts at. The policy may raise it; a shape decides what the rungs are. */
    level?: string;
    /** The short note a reader sees, when the shape's own summary is not enough. */
    message?: string;
    /** Whether the capture is taken at all. A scope's configuration may also switch it off. */
    enabled?: boolean;
    /** The fraction of calls captured, `1` by default — a packet capture is rarely wanted in full. */
    sample?: number;
    /** Rules this capture always applies, beside its shape's floor. */
    mask?: IMask;
}

/** A declared capture, with the fields that make it callable. */
export interface ICapture extends ICaptureEntry {
    kind: 'capture';
    id: string;
}

export interface IVocabularyDeclaration {
    log?: Record<string, ILogEntry | string>;
    error?: Record<string, IErrorEntry | string>;
    capture?: Record<string, ICaptureEntry>;
    decision?: Record<string, IDecisionEntry>;
}

/** A declared log signal, with its defaults resolved. */
export interface ILogSignal extends ILogEntry {
    kind: 'log';
    id: string;
    /** Declared on a package's behalf by the compatibility logger rather than by the package. */
    legacy?: boolean;
}

/** A declared error signal, with its defaults resolved. */
export interface IErrorSignal extends IErrorEntry {
    kind: 'error';
    id: string;
}

/** Either kind. */
export type ISignal = ILogSignal | IErrorSignal;

/** A declared vocabulary: every signal it holds, by identifier. */
export interface IVocabulary {
    kind: 'vocabulary';
    signal: Readonly<Record<string, ISignal>>;
    /** The declared captures, which are configured rather than called like a signal. */
    capture?: Readonly<Record<string, ICapture>>;
    /** The declared decisions: the choices this component names, and their arms. */
    decision?: Readonly<Record<string, IDecision>>;
    /** Where the declaration was written, so a duplicate across two of them can name both. */
    origin?: ISite;
}

/**
 * The parameter names a message declares, as a type.
 *
 * A call supplies exactly what the message interpolates, so the compiler is the check the plan asks
 * for: a placeholder the call does not supply is a type error rather than a `?name?` printed to
 * somebody. Only the brace spelling is read here — `?name?` is normalised at runtime for the realm
 * that writes it, and typing it would make two spellings of one contract.
 */
export type PlaceholderNames<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholderNames<Rest>
    : never;

/** The message literal of one declared entry. */
export type MessageOf<E> = E extends string
    ? E
    : E extends {readonly message: infer M}
      ? M extends string
          ? M
          : string
      : string;

/** The parameters one signal takes, from the placeholders of its message. */
export type SignalParams<E> = {[K in PlaceholderNames<MessageOf<E>>]: string | number};

/** The identifiers a declaration names. */
export type SignalId<D extends IVocabularyDeclaration> =
    | (keyof NonNullable<D['log']> & string)
    | (keyof NonNullable<D['error']> & string);

/** The decisions a declaration names. */
export type DecisionId<D extends IVocabularyDeclaration> =
    keyof NonNullable<D['decision']> & string;

/** The arms one declared decision offers. */
export type DecisionBranch<D, I extends string> = D extends {
    decision: Record<I, {branch: infer B}>;
}
    ? keyof B & string
    : string;

/**
 * The callable surface a declaration produces.
 *
 * One method per identifier, taking the parameters its message interpolates. Log signals answer
 * nothing; error signals answer the failure the caller throws, which is why a declaration is what
 * makes throwing and recording one call (`@@D-890`).
 */
export type SignalVocabulary<D extends IVocabularyDeclaration> = {
    readonly [K in SignalId<D>]?: (
        params: K extends keyof NonNullable<D['log']>
            ? SignalParams<NonNullable<D['log']>[K]>
            : K extends keyof NonNullable<D['error']>
              ? SignalParams<NonNullable<D['error']>[K]>
              : never,
    ) => void;
};

/** The identifier a declaration key names, kept for the error a bad key raises. */
function identifierOf(id: string): string {
    if (!IDENTIFIER.test(id)) {
        throw new Error(
            `lukaot: "${id}" is not an identifier — a signal is one camelCase token ` +
                '(`agentTicketNotFound`), never a dotted name',
        );
    }
    return id;
}

/** The message with `?name?` rewritten to `{name}`, so one interpolation serves both spellings. */
export function normaliseMessage(message: string): string {
    return message.replace(QUESTION_PLACEHOLDER, (_, name: string) => `{${name}}`);
}

/** A declared entry with its defaults, or a message naming what is wrong with it. */
function signalOf(
    kind: 'log' | 'error',
    id: string,
    entry: ILogEntry | IErrorEntry | string,
): ISignal {
    const declared = typeof entry === 'string' ? {message: entry} : entry;
    if (!declared.message) {
        throw new Error(`lukaot: "${id}" declares no message`);
    }
    const message = normaliseMessage(declared.message);
    if (declared.level !== undefined && !LEVEL_NAMES.includes(declared.level)) {
        throw new Error(
            `lukaot: "${id}" declares level "${String(declared.level)}", which is not one of ` +
                LEVEL_NAMES.join(', '),
        );
    }
    return kind === 'log'
        ? {kind, id, level: 'info', ...declared, message}
        : {kind, id, level: 'error', ...declared, message};
}

/**
 * Declare a vocabulary.
 *
 * Callable from a layer file and from code — a library computing its keys, a handler group declaring
 * inline — because some names are only known at assembly time. It is not how a signal is *emitted*:
 * there is no level API, so every call is a method of what this returns (`@@D-891`).
 */
/**
 * The kind marker the framework's loader reads.
 *
 * `Symbol.for` gives one symbol for one string across every copy of every package, which is why this
 * needs no import from `blong`: the loader classifies a module by
 * `${typeof what}:${what[Symbol.for('blong:kind')]}`, and a declaration set here is a
 * `object:vocabulary` there. Without it a declaration would arrive as a bare object, which is exactly
 * the shape the loader has no case for — and the reason a realm's `error/error.ts` map has been
 * silently dropped.
 */
const Kind: symbol = Symbol.for('blong:kind');

/** What the loader calls a declaration. */
export const VOCABULARY_KIND = 'vocabulary';

/**
 * What a declaration hands back: the vocabulary, the literal it was written as, and the decisions as
 * a *required* map when it declared any.
 *
 * `IVocabulary.decision` is optional because most vocabularies declare no decisions; a call site that
 * has one should not have to say `?.` about its own declaration, and its arms should be the literal
 * set it wrote rather than `string`. This is where that is expressed, once, instead of at every
 * `decide` (`@@D-914`).
 */
export type DeclaredVocabulary<D extends IVocabularyDeclaration> = IVocabulary & {
    readonly declared: D;
} & ('decision' extends keyof D
        ? {
              readonly decision: {
                  [K in keyof NonNullable<D['decision']>]: NonNullable<
                      D['decision']
                  >[K] & {kind: 'decision'; id: K & string};
              };
          }
        : {readonly decision?: undefined});

export function declare<const D extends IVocabularyDeclaration>(
    definition: D,
): DeclaredVocabulary<D> {
    const signal: Record<string, ISignal> = {};
    for (const kind of ['log', 'error'] as const) {
        for (const [id, entry] of Object.entries(definition[kind] ?? {})) {
            identifierOf(id);
            if (signal[id]) {
                throw new Error(
                    `lukaot: "${id}" is declared twice — in "${signal[id]!.kind}" and in "${kind}"`,
                );
            }
            signal[id] = signalOf(kind, id, entry as ILogEntry | IErrorEntry | string);
        }
    }
    const capture: Record<string, ICapture> = {};
    for (const [id, entry] of Object.entries(definition.capture ?? {})) {
        identifierOf(id);
        if (signal[id] || capture[id]) {
            throw new Error(`lukaot: "${id}" is declared twice`);
        }
        capture[id] = {kind: 'capture', id, ...entry};
    }
    const decision: Record<string, IDecision> = {};
    for (const [id, entry] of Object.entries(definition.decision ?? {})) {
        identifierOf(id);
        if (signal[id] || capture[id] || decision[id]) {
            throw new Error(`lukaot: "${id}" is declared twice`);
        }
        if (Object.keys(entry.branch).length === 0) {
            throw new Error(
                `lukaot: decision "${id}" declares no arms — a decision is the set of arms it offers`,
            );
        }
        // An arm's name is a label a diagram draws and a reader greps, so it obeys the identifier
        // grammar for the same reason the decision's own name does.
        for (const arm of Object.keys(entry.branch)) identifierOf(arm);
        decision[id] = {kind: 'decision', id, ...entry};
    }
    for (const key of Object.keys(definition)) {
        if (key !== 'log' && key !== 'error' && key !== 'capture' && key !== 'decision') {
            throw new Error(
                `lukaot: "${key}" is not a declaration kind — declare "log", "error", "capture" or "decision"`,
            );
        }
    }
    return Object.defineProperty(
        {
            kind: 'vocabulary',
            signal,
            ...(Object.keys(capture).length === 0 ? {} : {capture}),
            ...(Object.keys(decision).length === 0 ? {} : {decision}),
            declared: definition,
            origin: captureSite(),
        } as unknown as DeclaredVocabulary<D>,
        Kind,
        {value: VOCABULARY_KIND, enumerable: false},
    );
}

/**
 * Merge several vocabularies into one — a layer's, a `library()`'s, a handler group's.
 *
 * Some names are only known at assembly time, which is what makes a declaration callable from code;
 * that declaration is not a second mechanism, so it lands in the same map as the one in
 * `lukaot/signal.ts` and is refused if it repeats a name. The two origins are named because the
 * likely cause is one signal declared on both paths, and a reader needs the pair to delete one.
 */
export function compose(...vocabularies: IVocabulary[]): IVocabulary {
    const signal: Record<string, ISignal> = {};
    const origin = new Map<string, ISite | undefined>();
    for (const vocabulary of vocabularies) {
        for (const [id, entry] of Object.entries(vocabulary.signal)) {
            const first = origin.get(id);
            if (signal[id]) {
                throw new Error(
                    `lukaot: "${id}" is declared twice — at ${describeSite(first)} ` +
                        `and at ${describeSite(vocabulary.origin)}`,
                );
            }
            signal[id] = entry;
            origin.set(id, vocabulary.origin);
        }
    }
    const decision: Record<string, IDecision> = {};
    for (const vocabulary of vocabularies) {
        for (const [id, entry] of Object.entries(vocabulary.decision ?? {})) {
            if (signal[id] || decision[id]) {
                throw new Error(
                    `lukaot: "${id}" is declared twice — at ${describeSite(origin.get(id))} ` +
                        `and at ${describeSite(vocabulary.origin)}`,
                );
            }
            decision[id] = entry;
        }
    }
    return {
        kind: 'vocabulary',
        signal,
        ...(Object.keys(decision).length === 0 ? {} : {decision}),
        origin: vocabularies[0]?.origin,
    };
}

/**
 * The vocabularies a *package* ships, which every port in the process carries.
 *
 * A realm owns a port, so its declarations reach that port and no other (`@@D-896`). A **library**
 * does not own one: `blong-mock`'s handlers run on whichever realm attached them, `blong-chain` is a
 * class handed a logger, and neither can know which process it will be imported into. Declaring into
 * the realm's file would mean every host copying the library's names, matched by a string no compiler
 * checks — so instead a package declares once, at its own module load, and the framework composes what
 * it contributed into every port it attaches a vocabulary to.
 *
 * This is deliberately *not* a second registry: `contribute` returns the same `IVocabulary` a
 * `declare` does, `compose` treats it like any other, and two declarations of one name are refused
 * where they always were. The list is what a port's attacher reads to know what the packages in this
 * process report (`@@D-918`).
 */
const contributed: IVocabulary[] = [];

/** Declare a package's vocabulary, for every port in this process to carry. */
export function contribute<const D extends IVocabularyDeclaration>(definition: D): DeclaredVocabulary<D> {
    const vocabulary = declare(definition);
    if (!contributed.includes(vocabulary as unknown as IVocabulary)) contributed.push(vocabulary);
    return vocabulary;
}

/** The vocabularies packages have contributed, in the order they were declared. */
export function contributedVocabularies(): readonly IVocabulary[] {
    return contributed;
}

/**
 * Forget every contribution, for a test that asserts what a process without one reports.
 *
 * Not exported from the package root: a test that needs it imports this module, because nothing in a
 * running process should be able to take a package's names away.
 */
export function clearContributed(): void {
    contributed.length = 0;
}
