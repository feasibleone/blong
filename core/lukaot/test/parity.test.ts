/**
 * The parity matrix: what the libraries lukaot replaces could do, and what happened to each.
 *
 * The point of this file is not the table — it is the second test, which reads every test a row cites
 * and fails when that test's title is no longer in its file. A matrix that drifts from the suite is worse
 * than none: it says a capability is covered when the assertion behind it was renamed, deleted or
 * silently weakened (`@@T-721`).
 *
 * A row's `status` is one of four words, and they are meant literally:
 *
 * - `kept` — the capability exists and behaves as it did.
 * - `kept-extended` — it exists and does more than the old one did, which a reader of the old docs has to
 *   be told.
 * - `replaced` — a different mechanism now provides it, so the *concept* survived but the API did not.
 * - `dropped` — it is deliberately gone, with the consequence stated. Every dropped row names what a
 *   reader loses, because a matrix that only lists wins is marketing.
 *
 * The requirements are the semantic-log rationale's R1–R27, plus the pino capabilities the framework
 * actually relied on and the typed-error contract, since those are the two other libraries this replaces.
 * The old pages stay in the tree until the rewrite lands (`@@T-723`), and this file cites them by
 * requirement so the two can be read side by side.
 */

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from 'tap';

type Status = 'kept' | 'kept-extended' | 'replaced' | 'dropped';

interface ICoverage {
    /** The test file, relative to this package. */
    file: string;
    /** The title exactly as the suite declares it — the thing a rename would break. */
    title: string;
}

interface IRow {
    /** The requirement or capability this row is about. */
    id: string;
    /** What it is, in one phrase. */
    capability: string;
    status: Status;
    /** What changed for a reader, the user-visible consequence. Empty for a plain `kept`. */
    consequence?: string;
    /** The assertions that hold it up. Empty only for a `dropped` row. */
    cover: readonly ICoverage[];
}

const ROWS: readonly IRow[] = [
    {
        id: 'R1',
        capability: 'normalization and masking of variable values',
        status: 'kept',
        cover: [
            {file: 'src/normalize.test.ts', title: 'variable values are replaced by stable tokens'},
        ],
    },
    {
        id: 'R2',
        capability: 'deterministic serialization and stack compaction',
        status: 'kept',
        cover: [
            {
                file: 'src/fingerprint.test.ts',
                title: 'serialization is a deterministic prefixed string',
            },
            {
                file: 'src/stack.test.ts',
                title: 'compaction keeps the error type and the first two frames',
            },
        ],
    },
    {
        id: 'R3',
        capability: 'hash-first fingerprinting',
        status: 'kept',
        cover: [
            {
                file: 'src/fingerprint.test.ts',
                title: 'two executions differing only in variable values share a fingerprint',
            },
        ],
    },
    {
        id: 'R4',
        capability: 'the registry as a durable artifact',
        status: 'kept-extended',
        consequence:
            'a registry is now fed by *declarations* rather than only by observation, so an identifier ' +
            'exists before it is first reached and its policy can silence it in advance',
        cover: [
            {
                file: 'src/registry.test.ts',
                title: 'a declaration resolves to one entry per identifier',
            },
        ],
    },
    {
        id: 'R5',
        capability: 'a pluggable embedding provider',
        status: 'dropped',
        consequence:
            'search ranks by identifier and text instead of cosine distance, so "what is like this" is ' +
            'no longer answerable — "what mentions this" is',
        cover: [],
    },
    {
        id: 'R6',
        capability: 'novelty, rate-shift and drift detectors',
        status: 'dropped',
        consequence:
            'nothing is flagged as anomalous; a reader finds an unusual record by searching, and the ' +
            'digest says what changed rather than what is suspicious',
        cover: [],
    },
    {
        id: 'R7',
        capability: 'causal lineage and intent',
        status: 'kept',
        cover: [
            {
                file: 'src/service/lineage.test.ts',
                title: 'a chain is walked from root to leaf (PRD R7 acceptance)',
            },
            {
                file: 'src/logger.test.ts',
                title: 'consecutive records in one scope are chained parent to child (PRD R7)',
            },
        ],
    },
    {
        id: 'R8',
        capability: 'the digest change stream',
        status: 'kept',
        cover: [{file: 'src/service/digest.test.ts', title: 'entries carry a monotonic cursor'}],
    },
    {
        id: 'R9',
        capability: 'flow and step progress',
        status: 'kept',
        cover: [
            {
                file: 'src/context.test.ts',
                title: 'enterFlow names the execution for the rest of it, past an await',
            },
            {file: 'src/context.test.ts', title: 'flow steps advance the recorded position'},
        ],
    },
    {
        id: 'R10',
        capability: 'progressive disclosure (withhold, escalate)',
        status: 'kept',
        cover: [
            {
                file: 'src/logger.test.ts',
                title: 'escalation without a reason still releases the withheld detail',
            },
        ],
    },
    {
        id: 'R11',
        capability: 'branch rationale',
        status: 'kept',
        cover: [
            {
                file: 'src/decide.test.ts',
                title: 'the chosen branch runs and the rationale is recorded',
            },
        ],
    },
    {
        id: 'R12',
        capability: 'signature-stable identity across deploys',
        status: 'kept',
        cover: [
            {
                file: 'src/fingerprint.test.ts',
                title: 'a stack that differs only in its home directory is one identity',
            },
        ],
    },
    {
        id: 'R13',
        capability: 'exemplar retention per identity',
        status: 'kept',
        cover: [
            {
                file: 'src/service/app.test.ts',
                title: 'a retained record is read back, and an unknown one is not',
            },
        ],
    },
    {
        id: 'R14',
        capability: 'semantic search and deploy diff',
        status: 'kept-extended',
        consequence:
            'search is lexical over identifiers, messages and records; the diff is per window',
        cover: [
            {
                file: 'src/service/app.test.ts',
                title: 'search ranks signals and records in one list',
            },
            {
                file: 'src/service/app.test.ts',
                title: 'the deploy diff answers what a window changed',
            },
        ],
    },
    {
        id: 'R15',
        capability: 'cross-service incident correlation',
        status: 'dropped',
        consequence:
            'the incident surface is gone: a realm reads flows, a diagram and a digest, and grouping ' +
            "related failures is a reader's work again",
        cover: [{file: 'src/service/app.test.ts', title: 'there is no incident surface'}],
    },
    {
        id: 'R16',
        capability: 'facet projection at read time',
        status: 'kept',
        cover: [
            {
                file: 'src/service/facets.test.ts',
                title: 'the facet list is the three audiences, and only those are asked for',
            },
        ],
    },
    {
        id: 'R17',
        capability: 'the library *is* the logging API',
        status: 'kept-extended',
        consequence:
            'a level call is no longer the API: a site names the thing that happened, and the payload ' +
            'shapes (`capture`) are declared beside the signals rather than passed as objects',
        cover: [
            {
                file: 'src/package.test.ts',
                title: 'the subpaths the exports map declares are importable',
            },
            {file: 'src/captureWriter.test.ts', title: 'a shape family names the member'},
        ],
    },
    {
        id: 'R18',
        capability: 'readable stdout independent of the service',
        status: 'kept',
        cover: [
            {
                file: 'src/transport.test.ts',
                title: 'human mode writes the readable line, not the json',
            },
        ],
    },
    {
        id: 'R19',
        capability: 'cross-reference identifiers',
        status: 'kept-extended',
        consequence:
            'the scheme is `lukaot://`, and a capture payload larger than the inline bound is retained ' +
            'and rendered as its `p` reference rather than printed',
        cover: [
            {
                file: 'src/refs.test.ts',
                title: 'mintRecordRef mints unique monotonic ids without any service call',
            },
            {
                file: 'src/logger.test.ts',
                title: 'every emitted record lands in the local cache',
            },
        ],
    },
    {
        id: 'R20',
        capability: 'standard rendered format',
        status: 'kept',
        cover: [
            {
                file: 'src/render.test.ts',
                title: 'the header carries the listed details in a greppable order',
            },
            {
                file: 'src/render.test.ts',
                title: 'a record with no optional detail renders as exactly one line',
            },
        ],
    },
    {
        id: 'R21',
        capability: 'inspect on demand',
        status: 'kept',
        cover: [
            {
                file: 'src/package.test.ts',
                title: 'the subpaths the exports map declares are importable',
            },
            {
                file: 'src/logger.test.ts',
                title: 'a fatal record is on disk the moment fatal returns, with no flush (PRD R21)',
            },
        ],
    },
    {
        id: 'R22',
        capability: 'call identity as a library capability',
        status: 'kept',
        cover: [
            {
                file: 'src/capability.test.ts',
                title: 'a capability is inherited by everything the scope does',
            },
            {
                file: 'src/context.test.ts',
                title: 'calls are numbered by a counter in the enclosing scope (PRD R22)',
            },
        ],
    },
    {
        id: 'R23',
        capability: 'diagrams of what was observed',
        status: 'kept',
        cover: [
            {
                file: 'src/service/diagram.test.ts',
                title: 'a union draws the branches a call was declared in, each with its own counts',
            },
        ],
    },
    {
        id: 'R24',
        capability: 'semantic search over records',
        status: 'kept',
        cover: [
            {
                file: 'src/service/search.test.ts',
                title: 'a signal is found by a token in its identifier',
            },
        ],
    },
    {
        id: 'R25',
        capability: 'a real local embedding provider',
        status: 'dropped',
        consequence: 'no model is loaded, so no ranking is learned and nothing is embedded locally',
        cover: [],
    },
    {
        id: 'R26',
        capability: 'progress points',
        status: 'kept',
        cover: [
            {
                file: 'src/context.test.ts',
                title: 'a taken rationale is cleared for every scope that shares its box',
            },
        ],
    },
    {
        id: 'R27',
        capability: 'progress points in the diagram',
        status: 'kept',
        cover: [
            {
                file: 'src/service/diagram.test.ts',
                title: 'a call made inside a branch is drawn in an alt block, with the branch not taken left empty',
            },
        ],
    },
    {
        id: 'P1',
        capability: 'pino: a level API with child bindings',
        status: 'replaced',
        consequence:
            'a `createLogger` with the same six levels, `child` and `setLevel` now lives in lukaot, and ' +
            "the framework's own log face keeps the `(fields, message)` order every call site uses",
        cover: [
            {
                file: 'src/logger.test.ts',
                title: 'child loggers inherit bindings and can add their own',
            },
            {
                file: 'src/logger.test.ts',
                title: 'the level threshold filters, and can change at runtime',
            },
        ],
    },
    {
        id: 'P2',
        capability: 'pino: transports and multiple destinations',
        status: 'replaced',
        consequence:
            'a writer plus optional sinks replace the worker-thread transports; there is no worker, so a ' +
            'slow destination blocks the caller instead of a queue',
        cover: [
            {
                file: 'src/logger.test.ts',
                title: 'a sink is appended to the writer and never displaces it',
            },
        ],
    },
    {
        id: 'P3',
        capability: 'pino: redaction of paths',
        status: 'kept-extended',
        consequence:
            'redaction runs before any sink, and a payload adds `partial` and `hash` modes, deep key rules ' +
            'and byte ranges for a binary frame',
        cover: [
            {
                file: 'src/redact.test.ts',
                title: 'redactRecord replaces matched values and leaves the rest',
            },
            {
                file: 'src/capture.test.ts',
                title: 'partial keeps the ends, hash keeps a stable digest',
            },
        ],
    },
    {
        id: 'E1',
        capability: 'a typed error with a status code, recorded where it is created',
        status: 'kept',
        cover: [
            {file: 'src/error.test.ts', title: 'one call answers one error and writes one record'},
        ],
    },
    {
        id: 'E2',
        capability: '`silent` — a control-flow failure that records nothing',
        status: 'kept',
        cover: [
            {
                file: 'src/error.test.ts',
                title: 'a silent signal constructs the value and writes nothing',
            },
        ],
    },
];

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

test('every capability of the replaced libraries is accounted for', async t => {
    t.equal(ROWS.length, 32, 'R1–R27, three pino capabilities and two typed-error behaviours');
    for (const row of ROWS) {
        t.ok(row.capability.length > 0, `${row.id} names a capability`);
        if (row.status === 'dropped') {
            t.ok(
                (row.consequence ?? '').length > 0,
                `${row.id} is dropped, and says what a reader loses`,
            );
        }
        if (row.status !== 'dropped') {
            t.ok(row.cover.length > 0, `${row.id} is claimed to exist, so it names a test`);
        }
    }
    t.end();
});

test('every cited test still exists under the name the matrix gives it', async t => {
    for (const row of ROWS) {
        for (const {file, title} of row.cover) {
            const source = readFileSync(join(root, file), 'utf8');
            t.ok(
                source.includes(`'${title}'`),
                `${row.id} cites "${title}" in ${file}, which is still there`,
            );
        }
    }
    t.end();
});
