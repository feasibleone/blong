/**
 * Unit tests for the memory-file checker (`memoryCheck.ts`).
 *
 * These rules are the gate: a clean file must produce nothing, and each way of
 * drifting from the format must be named. Spelling is a separate step (cspell,
 * from the command), so it is not covered here.
 */

import {test} from 'tap';

import {checkDoc, type ICheckContext} from './memoryCheck.ts';
import {withRefreshedIndex} from './memoryIndex.ts';
import {parseDoc, splitLines} from './memoryParse.ts';
import type {IMemoryDoc, MemoryKind} from './memoryTypes.ts';

const CONTEXT: ICheckContext = {ids: new Map(), packages: new Set(['core/x'])};

function docFrom(text: string, kind: MemoryKind = 'friction', scope = 'root'): IMemoryDoc {
    const doc: IMemoryDoc = {
        path: 'x/.github/memory/friction.md',
        kind,
        scope,
        lines: splitLines(text),
    };
    doc.lines = withRefreshedIndex(doc.lines, parseDoc(doc.lines), kind);
    return doc;
}

/** Messages of every problem found, for terser assertions. */
function messages(doc: IMemoryDoc, context: ICheckContext = CONTEXT): string[] {
    return checkDoc(doc, context).map(problem => problem.message);
}

test('a well-formed file has no problems', async t => {
    const doc = docFrom(`# Frictions

## Open

### F-001 — a real thing

> _2026-01-01 · cross-cutting · open_

A body.
`);
    t.same(messages(doc), [], 'clean');
    t.end();
});

test('checkDoc names a wrong title and a missing index', async t => {
    const doc: IMemoryDoc = {
        path: 'x.md',
        kind: 'friction',
        scope: 'root',
        lines: splitLines('# Wrong\n\n## Open\n'),
    };
    const found = messages(doc);
    t.ok(
        found.some(message => message.includes('title should be "# Frictions"')),
        'title reported',
    );
    t.ok(
        found.some(message => message.includes('exactly one index block')),
        'missing index reported',
    );
    t.end();
});

test('checkDoc reports an entry in the wrong section and a malformed meta line', async t => {
    const wrongSection = docFrom(`# Frictions

## Open

### F-001 — already done
_2026-01-01 · cross-cutting · resolved_

Body.
`);
    t.ok(
        messages(wrongSection).some(message => message.includes('belongs in "## Resolved"')),
        'section mismatch reported',
    );

    const noMeta = docFrom(`# Frictions

## Open

### F-001 — no meta
Just prose straight after the heading.
`);
    t.ok(
        messages(noMeta).some(message => message.includes('missing or malformed meta line')),
        'meta reported',
    );
    t.end();
});

test('checkDoc validates status and area', async t => {
    const doc = docFrom(`# Frictions

## Open

### F-001 — odd status
_2026-01-01 · nowhere · pending_

Body.
`);
    const found = messages(doc);
    t.ok(
        found.some(message => message.includes('status "pending" is not one of')),
        'status reported',
    );
    t.ok(
        found.some(message => message.includes('unknown area "nowhere"')),
        'area reported',
    );
    t.end();
});

test('checkDoc warns when the root file holds a package entry', async t => {
    const doc = docFrom(`# Frictions

## Open

### F-001 — package business
_2026-01-01 · core/x · open_

Body.
`);
    const problem = checkDoc(doc, CONTEXT).find(candidate =>
        candidate.message.includes('belongs in that package'),
    );
    t.equal(problem?.severity, 'warning', 'a warning, not an error');
    t.end();
});

test('checkDoc catches an over-long line, a line reference and a duplicate id', async t => {
    const long = docFrom(`# Frictions

## Open

### F-001 — long prose
_2026-01-01 · cross-cutting · open_

${'word '.repeat(30).trim()}
`);
    t.ok(
        messages(long).some(message => message.includes('could be wrapped')),
        'long line reported',
    );

    const reference = docFrom(`# Frictions

## Open

### F-001 — see elsewhere
_2026-01-01 · cross-cutting · open_

See decision.md L1153 for the reasoning.
`);
    t.ok(
        messages(reference).some(message => message.includes('rots — use the entry id')),
        'line reference reported',
    );

    const duplicate = docFrom(`# Frictions

## Open

### F-001 — clashes
_2026-01-01 · cross-cutting · open_

Body.
`);
    const context: ICheckContext = {
        ids: new Map([['F-001', 'other/.github/memory/friction.md']]),
        packages: new Set(['core/x']),
    };
    t.ok(
        messages(duplicate, context).some(message => message.includes('is also used in other/')),
        'duplicate id reported',
    );
    t.end();
});

test('checkDoc flags a stale index', async t => {
    const lines = splitLines(
        [
            '# Frictions',
            '',
            '<!-- memory:index -->',
            '<!-- /memory:index -->',
            '',
            '## Open',
            '',
            '### F-001 — a thing',
            '_2026-01-01 · cross-cutting · open_',
        ].join('\n'),
    );
    const doc: IMemoryDoc = {path: 'x.md', kind: 'friction', scope: 'root', lines};
    t.ok(
        messages(doc).some(message => message.includes('index is out of date')),
        'stale index reported',
    );
    t.end();
});
