#!/usr/bin/env -S node
/**
 * Resolve one reference from the retained local store (PRD R19, R21).
 *
 * Lookup is a single file read — the CLI never enumerates the cache to find a
 * record, which is R21's acceptance criterion. Exit codes are part of the
 * contract because §8 q11 asks that a reference whose record is no longer
 * retained be reported distinctly from one that never resolved.
 *
 * The store itself cannot tell those two apart: `get` and `getPayload` answer
 * `undefined` for both, and pruning removes an entry's index line as well as its
 * file, so no trace of a pruned id survives to be read. The distinction is
 * therefore *not* derived here. Inferring it from the id's shape or age would
 * report a fact the store does not hold, so instead `--expect-retained` lets the
 * caller — who knows the reference was once live — state that expectation
 * explicitly, and the CLI reports the mismatch as exit 2 rather than silently
 * calling the reference unknown. Without the flag an absent entry is exit 1.
 * Making the distinction derivable needs the cache to keep a tombstone of pruned
 * ids; that is a store change and is deliberately not made here.
 *
 * The reference's own kind chooses the store: `semantic-log://record/<id>` reads
 * the record half, `semantic-log://payload/<id>` the payload half (PRD R19), and
 * a bare id keeps the record kind. A payload is a large embedded value that the
 * rendered line replaced with a reference; printing it back is what makes the
 * reference *inline* rather than a claim check.
 */

import {realpathSync, statSync, type Stats} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openCache, type RecordCache} from '../src/cache.ts';
import {REF_SCHEME} from '../src/refs.ts';
import {renderHuman, renderJson} from '../src/render.ts';

/** The destinations the CLI writes to, injected so a test never exits a process. */
export interface InspectIo {
    out: (text: string) => void;
    err: (text: string) => void;
}

/** The options `parseInspectArgs` resolves from a command line. */
export interface InspectArgs {
    /** The reference or bare id to resolve, exactly as given. */
    reference: string;
    /** The cache root; `~/.semantic-log/cache` when `--cache` is not given. */
    dir: string;
    /** Render the machine-readable form instead of the readable one. */
    json: boolean;
    /** The caller asserts the reference was retained (see the module comment). */
    expectRetained: boolean;
}

/** A command line that parsed, or the usage rejection that says why it did not. */
export type InspectParse = {ok: true; args: InspectArgs} | {ok: false; message: string};

/** The store a reference resolves against when `--cache` is not given. */
const DEFAULT_CACHE = join(homedir(), '.semantic-log', 'cache');

const URI_PREFIX = `${REF_SCHEME}://`;

const USAGE =
    'usage: semantic-log-inspect [--cache <dir>] [--json] [--expect-retained] <reference|id>\n' +
    '  --expect-retained  the reference was retained, so an absent record is reported as pruned (exit 2) rather than unknown (exit 1)\n';

/** Strip a `semantic-log://<kind>/` prefix if present, leaving a bare id. */
export function toId(reference: string): string {
    if (!reference.startsWith(URI_PREFIX)) {
        return reference;
    }
    const rest = reference.slice(URI_PREFIX.length);
    const slash = rest.indexOf('/');
    return slash === -1 ? rest : rest.slice(slash + 1);
}

/**
 * The kind of a `semantic-log://<kind>/<id>` reference, or `undefined` for a
 * bare id or a scheme-only string.
 *
 * The kind decides *which* store the id is looked up in (PRD R19): a record
 * reference reads the record store, a payload reference reads the payload
 * store, and the id alone cannot say which. A bare id keeps the record kind,
 * exactly as before this kind existed.
 */
export function refKind(reference: string): string | undefined {
    if (!reference.startsWith(URI_PREFIX)) {
        return undefined;
    }
    const rest = reference.slice(URI_PREFIX.length);
    const slash = rest.indexOf('/');
    return slash === -1 ? undefined : rest.slice(0, slash);
}

/**
 * Render a resolved payload. The machine-readable mode is the compact JSON; the
 * readable one is the same value, indented. Either way the value itself is what
 * is printed — the HTTP surface returns exactly this value — so the two
 * surfaces carry the same detail rather than two renderings of it.
 */
function renderPayload(payload: unknown, json: boolean): string {
    return JSON.stringify(payload, null, json ? undefined : 2);
}

/** Resolve `argv` into options, or the usage message that rejects it. */
export function parseInspectArgs(argv: string[]): InspectParse {
    const args: InspectArgs = {reference: '', dir: DEFAULT_CACHE, json: false, expectRetained: false};
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--cache') {
            // A trailing `--cache` is a usage error rather than a silent fall
            // back to the default store, which would resolve the reference
            // against a different cache than the caller asked for.
            if (index + 1 === argv.length) {
                return {ok: false, message: `semantic-log-inspect: --cache needs a directory\n${USAGE}`};
            }
            args.dir = argv[++index];
        } else if (arg === '--json') {
            args.json = true;
        } else if (arg === '--expect-retained') {
            args.expectRetained = true;
        } else if (arg.startsWith('--')) {
            return {ok: false, message: `semantic-log-inspect: unknown option ${arg}\n${USAGE}`};
        } else {
            args.reference = arg;
        }
    }
    if (!args.reference) {
        return {ok: false, message: `semantic-log-inspect: a reference or id is required\n${USAGE}`};
    }
    return {ok: true, args};
}

/**
 * Resolve one reference and report it. Returns the exit code:
 * `0` resolved and printed · `1` unknown reference · `2` not retained (asserted
 * by `--expect-retained`) · `3` usage error.
 */
export async function inspect(argv: string[], io: InspectIo): Promise<number> {
    const parsed = parseInspectArgs(argv);
    if (!parsed.ok) {
        io.err(parsed.message);
        return 3;
    }
    const {reference, dir, json, expectRetained} = parsed.args;

    const cacheDir = resolve(dir);
    // An absent store is refused rather than created: `openCache` would make the
    // directory, so a typo in `--cache` would resolve every reference as unknown
    // against an empty store it had just invented. A path that exists but is not
    // a directory is refused for the same reason — and because `openCache`'s
    // `mkdir` rejects on it, which would otherwise escape `inspect` and land the
    // process on the unknown-reference exit code instead of this usage error.
    //
    // `throwIfNoEntry: false` suppresses *one* errno — ENOENT — and nothing
    // else. The stat still throws for ordinary bad input: EACCES when a path
    // component is unreadable, ELOOP for a self-referential symlink,
    // ENAMETOOLONG for an over-long path. Those are this same usage error, so
    // the call is contained rather than left to escape `inspect` and reach the
    // entry point as a stack trace on the unknown-reference exit code.
    let storeStat: Stats | undefined;
    try {
        storeStat = statSync(cacheDir, {throwIfNoEntry: false});
    } catch (error) {
        io.err(`semantic-log-inspect: cannot inspect cache path ${cacheDir}: ${(error as Error).message}\n`);
        return 3;
    }
    if (!storeStat) {
        io.err(`semantic-log-inspect: cache not found at ${cacheDir}\n`);
        return 3;
    }
    if (!storeStat.isDirectory()) {
        io.err(`semantic-log-inspect: cache path is not a directory: ${cacheDir}\n`);
        return 3;
    }

    // A lookup never writes, so the bound is irrelevant; the largest legal value
    // keeps this call from ever pruning the store it is only reading. Laying the
    // store out can still fail — an unwritable directory, or a plain file where
    // `records/` must go — and that is an ordinary bad input too, so it is
    // reported as a usage error rather than escaping as a rejection the entry
    // point would surface as a crash with a stack trace.
    let cache: RecordCache;
    try {
        cache = await openCache({dir: cacheDir, limit: Number.MAX_SAFE_INTEGER});
    } catch (error) {
        io.err(`semantic-log-inspect: cannot open cache at ${cacheDir}: ${(error as Error).message}\n`);
        return 3;
    }
    const id = toId(reference);
    if (refKind(reference) === 'payload') {
        // A payload reference resolves through the payload half of the same
        // store (`getPayload`), with the same exit-code contract as a record:
        // an id the store does not hold is unknown (1) unless the caller says it
        // was retained (2).
        const payload = await cache.getPayload(id);
        await cache.close();
        if (payload === undefined) {
            if (expectRetained) {
                io.err(`semantic-log-inspect: ${reference} - not retained\n`);
                return 2;
            }
            io.err(`semantic-log-inspect: ${reference} - unknown reference\n`);
            return 1;
        }
        io.out(`${renderPayload(payload, json)}\n`);
        return 0;
    }

    const record = await cache.get(id);
    await cache.close();

    if (!record) {
        if (expectRetained) {
            io.err(`semantic-log-inspect: ${reference} - not retained\n`);
            return 2;
        }
        io.err(`semantic-log-inspect: ${reference} - unknown reference\n`);
        return 1;
    }

    io.out(`${json ? renderJson(record) : renderHuman(record, {color: false})}\n`);
    return 0;
}

// The entry point runs only when this file is the program itself. The
// spawned-process test does execute this block — `test/spawn.test.ts` reaches it
// through a linked `bin` — but contributes no coverage: the child is started
// with `env -i` to keep the runner's instrumentation out of it, so
// `@tapjs/processinfo` is absent and nothing the child runs is attributed back
// here. The ignore is a documented exception rather than a claim that the code
// is out of reach; the spawned-process acceptance test asserts this output end
// to end.
//
// `process.argv[1]` is the path as invoked — the symlink the `bin` entry
// installs — while `import.meta.url` is the *real* path the loader resolved.
// Comparing the two directly is false for a linked invocation, which would skip
// this block and exit 0 having printed nothing: a silent success, not a crash.
// Resolving the invoked path first makes the link and the direct run agree. A
// missing argv[1] (a module run without a script) is guarded rather than handed
// to `realpathSync`, which would throw.
/* v8 ignore next 6 */
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
    process.exitCode = await inspect(process.argv.slice(2), {
        out: text => process.stdout.write(text),
        err: text => process.stderr.write(text),
    });
}
