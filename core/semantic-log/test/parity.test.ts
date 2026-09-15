/**
 * R17 conformance: the §5.1 capability parity matrix.
 *
 * **This file is the durable copy of the matrix.** The spec that proposed it has been
 * deleted, so the verdicts and the coverage paths below are the record rather than a
 * reading of one — which is why the audit resolves every name against the real sources.
 *
 * R17 requires that no row is undecided, that every Kept row has a conformance
 * test, and that every Replaced/Dropped row names its replacement and the
 * user-visible consequence. This file *is* the audit. Each row below names the
 * tests that cover it, and the second test resolves every name against the real
 * sources — so a test that was renamed or moved fails the suite instead of
 * being believed. The references were reconciled against the suite as it
 * stands, not against the plan that proposed it: twelve tasks of review moved
 * tests between files and renamed them, so every location named here is one
 * this matrix actually references (the withheld-buffer cases live in
 * `src/buffer.test.ts`, the record inspector in `src/redact.test.ts`).
 *
 * `unmet` records what a row still does not deliver. Those are findings, not
 * failures: the audit reports them and leaves them unmet rather than weakening
 * the row or inventing a covering test. What closing each one needs is recorded
 * in `.github/memory/todo.md`, which is committed — a report under the
 * gitignored `.superpowers/` would not survive a fresh clone.
 */

import {readFile, stat} from 'node:fs/promises';
import t from 'tap';

type Verdict = 'kept' | 'kept-extended' | 'replaced' | 'dropped';

interface Row {
    /** The verdict the spec gives this row. */
    verdict: Verdict;
    /**
     * `file::test title` for every test that covers the row. A Replaced or
     * Dropped row leads with the `consequence:` entry that states the
     * user-visible consequence the spec's R17 requires it to name.
     */
    covered: string[];
    /**
     * What the row does not deliver yet, if anything. One row keeps one: the
     * inline-payload reference kind (Plan 2 Task 14). When the last of those is
     * legitimately closed, the `t.ok(unmet.length > 0)` tripwire at the bottom
     * of this file goes red on purpose — update it deliberately, so a finding
     * cannot vanish unnoticed.
     */
    unmet?: string;
}

const CONSEQUENCE = 'consequence: ';

/** The spec's own audit line (§5.1): 13 Kept · 2 Kept-extended · 9 Replaced · 2 Dropped. */
const EXPECTED_VERDICTS: Readonly<Record<Verdict, number>> = {
    kept: 13,
    'kept-extended': 2,
    replaced: 9,
    dropped: 2,
};

/** row -> the tests that cover it, or the stated consequence. */
const MATRIX: Readonly<Record<string, Row>> = {
    'Log levels (built-in and custom), numeric and name': {
        verdict: 'kept',
        covered: [
            'src/level.test.ts::levelValue accepts a name or a number',
            'src/level.test.ts::levelName falls back to the raw value for custom levels',
        ],
    },
    'Level threshold filtering': {
        verdict: 'kept',
        covered: [
            'src/level.test.ts::enabled compares against an inclusive threshold',
            'src/logger.test.ts::the level threshold filters, and can change at runtime',
        ],
    },
    'Message plus structured key/value fields': {
        verdict: 'kept',
        covered: [
            'src/logger.test.ts::child loggers inherit bindings and can add their own',
            'src/render.test.ts::fields with no text form are skipped rather than printed as undefined',
        ],
    },
    'Child loggers and bindings inheritance': {
        verdict: 'kept',
        covered: ['src/logger.test.ts::child loggers inherit bindings and can add their own'],
    },
    'Multiple sinks in parallel (stdout + remote + file)': {
        verdict: 'kept',
        covered: [
            'src/writer.test.ts::a fan-out writes the same line, and the same record, to every destination',
            'src/writer.test.ts::one failing destination neither blocks nor suppresses the others',
            'src/writer.test.ts::a file destination and an in-memory one receive the line together',
            'src/logger.test.ts::a sink is appended to the writer and never displaces it',
            'src/logger.test.ts::the silence sentinel silences every sink too, and stays total',
            'src/service/transport.test.ts::a record reaches stdout and the service in parallel (§5.1)',
            'src/service/transport.test.ts::stdout, the service and a file all receive the same record (§5.1 row)',
        ],
    },
    'Pretty, human-readable development output': {
        verdict: 'kept',
        covered: [
            'src/render.test.ts::a record with no optional detail renders as exactly one line',
            'src/render.test.ts::the header carries the listed details in a greppable order',
            'src/render.test.ts::request and response render as labelled indented blocks, never a raw dump',
        ],
    },
    'Machine-readable output mode': {
        verdict: 'kept',
        covered: [
            'src/logger.test.ts::json mode emits one parseable object per record',
            'src/render.test.ts::json rendering carries the record verbatim',
        ],
    },
    'Dereferenceable reference in the terminal (clickable link)': {
        verdict: 'kept-extended',
        covered: [
            'src/refs.test.ts::refUri builds a dereferenceable uri for every kind',
            'src/refs.test.ts::hyperlink wraps the uri in an OSC 8 escape sequence',
            'src/render.test.ts::references are appended and are dereferenceable',
            'test/spawn.test.ts::a linked invocation resolves a record whose writer has exited',
            'test/cli.test.ts::a payload reference resolves through the payload half of the store',
            'test/cli.test.ts::--json prints a payload compactly, not indented',
            'test/cli.test.ts::an unknown payload exits 1, and 2 when it was expected to be retained',
        ],
        unmet:
            'R19 names the record and the inline-payload reference as the baseline kinds and asks both to ' +
            'resolve through the CLI *and* the HTTP API (Plan 2 Task 14). The kind now exists, `refUri` ' +
            'builds a dereferenceable `semantic-log://payload/<id>` uri, and the CLI resolves it with the ' +
            'same exit-code contract as a record (0 resolved / 1 unknown / 2 not retained / 3 usage), ' +
            'cited above. What is missing is the HTTP half: the service holds records, templates and ' +
            "exemplars but **no payload store** — a payload lives in the emitter's local cache, and the " +
            'service transport sends `IngestEvent`s that carry no payload body. Serving a payload over ' +
            'HTTP therefore needs a decision the plan does not make (ship payload bodies to the service, ' +
            "or re-scope R19's acceptance to the CLI). Recorded in `.github/memory/todo.md` rather than " +
            'invented here.',
    },
    'Redaction and path censorship': {
        verdict: 'kept-extended',
        covered: [
            'src/redact.test.ts::redactRecord replaces matched values and leaves the rest',
            'src/redact.test.ts::child loggers inherit the redaction paths',
            'src/redact.test.ts::redaction behaves identically in json mode',
            'src/logger.test.ts::a record is redacted before it is retained (§5.1 retained store row)',
        ],
    },
    'Serializers for error / request / response objects': {
        verdict: 'kept',
        covered: [
            'src/logger.test.ts::an Error in the error slot is serialized, not stringified',
            'src/logger.test.ts::a plain object in the error slot is kept as structured detail',
            'src/logger.test.ts::request and response details render as blocks',
        ],
    },
    'Base fields (pid, hostname, service, version)': {
        verdict: 'kept',
        covered: [
            'src/logger.test.ts::base fields are always present',
            'src/logger.test.ts::the version reaches the header and json mode, and a service can override it',
        ],
    },
    'Error-first call convention and stack capture': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'the mechanism is an options object (`logger.error(msg, {err})`) rather than a ' +
                'positional error; stack capture and rendering are kept, and passing an `Error` ' +
                'positionally is rejected in the parser rather than thrown ' +
                '(settled 2026-09-13 — the Kept verdict overstated the call shape)',
            'src/logger.test.ts::an Error in the error slot is serialized, not stringified',
            'src/render.test.ts::error type, message and stack render as a block',
            'src/stack.test.ts::compaction keeps the error type and the first two frames',
        ],
    },
    'Timestamps (epoch/ISO, monotonic)': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                '`record.time` is `Date.now()` epoch ms rendered as an ISO header; the monotonic half ' +
                'of the ability is carried by the ULID reference, which is what orders a burst within ' +
                'one millisecond (settled 2026-09-13 — Kept overstated a second clock)',
            'src/render.test.ts::the header carries the listed details in a greppable order',
            'src/render.test.ts::json rendering carries the record verbatim',
        ],
    },
    'Runtime level changes': {
        verdict: 'kept',
        covered: ['src/logger.test.ts::the level threshold filters, and can change at runtime'],
    },
    'Test-time silencing, capture and assertion': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'silencing and capture are kept through the writer seam (`setWriter(null)` / a ' +
                "capturing writer); assertion is the consumer's own test framework — there is " +
                'deliberately no built-in assertion helper (settled 2026-09-13 — Kept overstated ' +
                'the third verb)',
            'src/writer.test.ts::installing a writer replaces the destination, and null silences',
            'src/logger.test.ts::silencing is a writer swap, not a branch in the logger',
        ],
    },
    'Process-failure hooks (uncaught exception, unhandled rejection)': {
        verdict: 'kept',
        covered: [
            'src/logger.test.ts::captureProcessFailures records fatal failures and unregisters handlers',
            'src/logger.test.ts::captureProcessFailures also records uncaught exceptions',
        ],
    },
    'Fatal → flush → exit': {
        verdict: 'kept',
        covered: [
            'src/logger.test.ts::a predecessor is not drained by fatal, but the fatal record is on disk when fatal returns',
            'src/logger.test.ts::fatal exits through the injected exit function',
            'src/logger.test.ts::fatal exits through process.exit when no exit is injected',
            'src/logger.test.ts::a fatal record is on disk the moment fatal returns, with no flush (PRD R21)',
        ],
    },
    'Framework request logging and correlation id': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'the correlation id is the trace reference (R19) and is kept; request/response ' +
                'records carry application-supplied `req`/`res` detail and are emitted by the Plan 3 ' +
                'fixtures, not by a framework (settled 2026-09-13 — Kept overstated that the ' +
                'framework emits them)',
            'src/logger.test.ts::request and response details render as blocks',
            'src/context.test.ts::a bound trace is visible for the whole enclosed scope',
            'src/render.test.ts::references are appended and are dereferenceable',
        ],
    },
    'Non-blocking writes / worker-thread transport': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'non-blocking is kept — writes are queued in-process, bounded (`writeLimit`), and ' +
                "never awaited on the caller's stack; there is no worker-thread transport, and a " +
                'stalled store costs bounded memory with an observable `writeDropped` count ' +
                '(settled 2026-09-13 — Kept overstated the transport)',
            'src/logger.test.ts::a failing cache write is absorbed, and the next record still lands',
            'test/offline.test.ts::a hung cache cannot stall an emit, however large the burst',
            // Retitled when the audit gained the declared service-only
            // allowlist: it no longer claims that *every* module is offline,
            // only that no emitter module is.
            'test/offline.test.ts::only the declared service modules reach the network; every emitter module stays offline',
        ],
    },
    'Synchronous flush on shutdown': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'see Fatal → flush → exit: the fatal record is retained synchronously through ' +
                '`putSync`; `flush()` is asynchronous and queued writes are not drained at shutdown ' +
                '(settled 2026-09-13)',
            'src/logger.test.ts::fatal exits through the injected exit function',
            'src/logger.test.ts::a predecessor is not drained by fatal, but the fatal record is on disk when fatal returns',
            'src/cache.test.ts::putSync retains a record before it returns, with no flush of any kind',
            'src/cache.test.ts::a synchronous write is bounded and pruned like the asynchronous one',
        ],
    },
    'Console-only, zero-configuration usage': {
        verdict: 'kept',
        covered: [
            'src/writer.test.ts::the destination defaults to stdout before anything is installed',
            'src/logger.test.ts::zero-config usage writes a readable line to the configured writer',
            'test/offline.test.ts::a default logger emits with no service configured',
        ],
    },
    'Backpressure and drop policy': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'writes are never silently dropped: a bounded ring buffer counts its overflow ' +
                '(reported as `withheldDropped` on the next escalated record) instead of losing detail quietly',
            'src/buffer.test.ts::the bound discards the oldest entry and counts the loss',
            'src/buffer.test.ts::buffer overflow is reported, never silent',
        ],
    },
    'File rotation and retention': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'a bounded on-disk record cache (R21) replaces archival rotation — it exists so a ' +
                'reference resolves, and it prunes the oldest records without operator intervention',
            'src/cache.test.ts::the cache is bounded and prunes the oldest records',
            'src/cache.test.ts::a synchronous write is bounded and pruned like the asynchronous one',
        ],
    },
    'Sampling and rate limiting': {
        verdict: 'replaced',
        covered: [
            CONSEQUENCE +
                'no random dropping: detail is withheld (R10) and released on escalation, so a failure ' +
                'is never sampled away — the verbosity decision is decoupled from a static level',
            'src/buffer.test.ts::withheld detail is invisible until escalation',
            'src/buffer.test.ts::an error escalates automatically',
        ],
    },
    'Unbounded historical retention / audit of record': {
        verdict: 'dropped',
        covered: [
            CONSEQUENCE +
                'this is not an audit log of record — the local store is bounded and prunes itself; ' +
                'pair the emitter with an external store if retention is required',
            'src/cache.test.ts::the cache is bounded and prunes the oldest records',
        ],
    },
    'Browser-side logging': {
        verdict: 'dropped',
        covered: [
            CONSEQUENCE +
                'out of scope: this is a service-side emitter, with one Node entry point and no browser build',
        ],
    },
};

t.test('every matrix row is accounted for', t => {
    const rows = Object.entries(MATRIX);
    t.equal(rows.length, 26, 'the spec matrix has 26 rows; update both together');
    const counts: Record<string, number> = {};
    for (const [row, entry] of rows) {
        counts[entry.verdict] = (counts[entry.verdict] ?? 0) + 1;
        t.ok(
            entry.covered.length > 0,
            `row "${row}" (${entry.verdict}) states its coverage or consequence`,
        );
        if (entry.verdict === 'kept' || entry.verdict === 'kept-extended') {
            t.ok(
                entry.covered.every(reference => reference.includes('::')),
                `row "${row}" names a test, not a consequence`,
            );
        } else {
            t.ok(
                entry.covered[0]?.startsWith(CONSEQUENCE) === true,
                `row "${row}" states its ${entry.verdict} consequence first`,
            );
        }
    }
    t.same(counts, EXPECTED_VERDICTS, 'the verdicts match the audit line in §5.1');
    t.end();
});

/**
 * Does `source` declare a `t.test` titled exactly `title`? The gap after the
 * opening paren is allowed to contain whitespace because prettier breaks the
 * call when a title is long enough to exceed the print width — the title
 * itself is a single string literal and is never wrapped.
 */
const namesTest = (source: string, title: string): boolean =>
    new RegExp(`t\\.test\\(\\s*'${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(source);

t.test('no row claims a coverage path that does not exist', async t => {
    const sources = new Map<string, string>();
    for (const [, entry] of Object.entries(MATRIX)) {
        for (const covered of entry.covered) {
            if (covered.startsWith(CONSEQUENCE)) {
                continue;
            }
            const [file, ...title] = covered.split('::');
            let source = sources.get(file);
            if (source === undefined) {
                source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
                sources.set(file, source);
            }
            // Resolved against the file's text, not trusted: a renamed or moved
            // test makes this fail, which is the point of an audit.
            t.ok(namesTest(source, title.join('::')), `${covered} names a test that exists`);
        }
    }
});

t.test('the rows whose parity is not yet met are listed', t => {
    const unmet = Object.entries(MATRIX)
        .filter(([, entry]) => entry.unmet !== undefined)
        .map(([row, entry]) => `${row} — ${entry.unmet ?? ''}`);
    t.comment(`unmet parity rows (${unmet.length}):\n  ${unmet.join('\n  ')}`);
    // Deliberately not `ok(unmet.length === 0)`: these are findings to report,
    // not a green-suite problem. It is asserted that there are *some*, so a
    // finding cannot vanish without a deliberate edit here.
    t.ok(unmet.length > 0, 'the audit found rows that are not yet fully met, and says so');
    t.end();
});

t.test('the dropped browser row is not contradicted by a browser entry point', async t => {
    const manifest = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
        exports?: Record<string, unknown>;
    };
    t.same(Object.keys(manifest.exports ?? {}), ['.'], 'the package exports one Node entry point');
    await t.rejects(
        stat(new URL('../browser.ts', import.meta.url)),
        'no browser entry point exists',
    );
    await t.rejects(
        stat(new URL('../browser.js', import.meta.url)),
        'no browser entry point exists',
    );
});
