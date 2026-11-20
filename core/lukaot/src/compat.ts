/**
 * The compatibility logger: what a package that still calls a level gets until it is swept.
 *
 * lukaot has no level API — a signal is a declared method, not a message at a level — so a package
 * that has not been converted yet cannot simply be given `info`/`warn` again. What it can be given is
 * a declaration made on its behalf: a tuple of namespace, level and message becomes a signal named
 * `legacy` plus the namespace plus the message's first words (`legacyChatCannotVerifyTheToken`),
 * declared imperatively and marked `legacy: true`. It therefore has an identity, a policy and
 * retention like any other signal, and no masking, hashing or stack capture is needed to get them
 * (`@@D-891`).
 *
 * The list this produces is the work order: every unswept call site appears in `legacy()` with the
 * package that made it, and the list shrinks to empty as the sweeps land. A legacy signal is cheap to
 * keep, so nothing else forces the rename — the list is what keeps it honest.
 */

import type {ISignal, IVocabulary, LevelName} from './declare.ts';
import {LEVEL_NAMES} from './declare.ts';
import type {IIdentity, ISignalRecord} from './emit.ts';
import {render} from './emit.ts';
import type {SignalRegistry} from './registry.ts';

/** What a legacy logger needs. */
export interface ICompatOptions {
    /** The registry the legacy signals are declared into — a realm's, so its policy applies. */
    registry: SignalRegistry;
    /** Where a record goes. */
    write: (record: ISignalRecord) => void;
    /** The clock, for a test that pins the time. */
    now?: () => number;
    /** The ambient identity, read at emission. */
    identity?: () => IIdentity | undefined;
}

/** What one legacy call declared. */
export interface ILegacySignal {
    /** The identifier the tuple was given. */
    id: string;
    /** The package the call came from, when `logger` was told one. */
    package?: string;
    /** The message the identifier was derived from. */
    message: string;
    /** How many calls have been made through it. */
    calls: number;
}

/** The level methods a bound logger carries, as the framework calls them. */
export type LevelCalls = Partial<Record<LevelName, (entry: unknown, message?: string) => void>>;

/** A logger bound to one level the way `ILog.logger` binds it. */
export interface ICompatLogger extends LevelCalls {
    /** The level the logger was opened at. */
    level: LevelName | 'silent';
}

/** What the compatibility logger answers. */
export interface ICompatLog {
    /** The `ILog.logger` shape: a logger bound downwards from the level it is asked for. */
    logger(level: LevelName | 'silent', bindings?: {name?: string}): ICompatLogger;
    /** Every legacy signal declared so far, in declaration order. */
    legacy(): ILegacySignal[];
    /** The vocabulary they form, so the registry can count and patch them. */
    vocabulary(): IVocabulary;
}

/** The words of a message that make an identifier: letters and digits, four words at most. */
function words(message: string): string[] {
    return (message.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).slice(0, 4);
}

/** A word with its first letter raised, so the identifier reads as a camelCase token. */
function raise(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** A short stable hash, appended only when two messages reduce to one identifier. */
function shortHash(text: string): string {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(36).slice(0, 5);
}

/** The identifier a (namespace, message) pair is declared under. */
export function legacyId(namespace: string, message: string): string {
    const slug = words(message).map(raise).join('');
    return `legacy${raise(namespace.replace(/[^A-Za-z0-9]/g, ''))}${slug}`;
}

/**
 * Build the compatibility logger.
 *
 * The declaration happens on the first call of a (namespace, level, message) tuple and is reused
 * afterwards, so a call site that keeps printing the same sentence keeps one identity. A message that
 * reduces to an identifier already taken gets the message's short hash appended, which keeps two
 * different sentences apart without deriving identity from the text at runtime.
 */
export function createCompatLog(options: ICompatOptions): ICompatLog {
    const {registry, write, now = Date.now, identity} = options;
    const signal = new Map<string, ISignal>();
    const declared: ILegacySignal[] = [];
    const byId = new Map<string, ILegacySignal>();
    const slugOwner = new Map<string, string>();

    const declareLegacy = (namespace: string, level: LevelName, message: string): ILegacySignal => {
        const base = legacyId(namespace, message);
        const owner = slugOwner.get(base);
        const id = owner === undefined || owner === message ? base : `${base}${shortHash(message)}`;
        const existing = byId.get(id);
        if (existing) return existing;
        slugOwner.set(base, message);
        const entry: ILegacySignal = {id, package: namespace, message, calls: 0};
        declared.push(entry);
        byId.set(id, entry);
        const legacySignal: ISignal = {kind: 'log', id, level, message, legacy: true};
        signal.set(id, legacySignal);
        registry.declareSignal(legacySignal);
        return entry;
    };

    const call = (namespace: string, level: LevelName, entry: unknown, message?: string): void => {
        const text = typeof message === 'string' ? message : String(entry);
        const legacy = declareLegacy(namespace, level, text);
        legacy.calls += 1;
        registry.count(legacy.id, 'reached');
        const ambient = identity?.();
        write({
            signal: legacy.id,
            kind: 'log',
            level,
            message: render(text, entry),
            ...(entry === undefined ? {} : {params: entry}),
            ...(ambient === undefined ? {} : {identity: ambient}),
            time: now(),
        });
        registry.count(legacy.id, 'emitted');
    };

    return {
        logger(level, bindings) {
            const namespace = bindings?.name ?? 'app';
            const logger = {level} as ICompatLogger;
            const from = level === 'silent' ? LEVEL_NAMES.length : LEVEL_NAMES.indexOf(level);
            // The framework's contract binds *downwards*: asking for `info` yields `info` through
            // `fatal`, and leaves `trace` and `debug` undefined so a call at them is a silent no-op.
            for (const name of LEVEL_NAMES) {
                if (level === 'silent' || LEVEL_NAMES.indexOf(name) < from) continue;
                logger[name] = (entry: unknown, message?: string) =>
                    call(namespace, name, entry, message);
            }
            return logger;
        },
        legacy() {
            return [...declared];
        },
        vocabulary() {
            return {kind: 'vocabulary', signal: Object.fromEntries(signal)};
        },
    };
}
