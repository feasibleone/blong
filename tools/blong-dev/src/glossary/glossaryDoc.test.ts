/**
 * Unit tests for the glossary document model (glossary/glossaryDoc.ts).
 *
 * The parser, the sorter and the checker are pure over text plus (for links) the filesystem, so the
 * cases here build a document in memory and assert the shape a rewrite produces — the file the
 * command writes is the same string these functions return.
 */

import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {
    addTerm,
    checkGlossary,
    findTerm,
    GLOSSARY_END,
    GLOSSARY_START,
    linkTargets,
    loadGlossary,
    localTarget,
    outOfOrder,
    parseGlossary,
    removeTerm,
    renderGlossary,
    sortTerms,
} from './glossaryDoc.ts';

const DOC = [
    '# Glossary',
    '',
    'Intro text.',
    '',
    GLOSSARY_START,
    '',
    '**adapter** — One. See [adapter](./adapter.md).',
    '',
    '**chain** — Two. See [chain](./chain.md).',
    '',
    GLOSSARY_END,
    '',
].join('\n');

test('parseGlossary reads the intro, the entries and the markers', async t => {
    const doc = parseGlossary(DOC);
    t.ok(doc.marked, 'the markers are found');
    t.same(
        doc.prefix.map(line => line.trim()).filter(Boolean),
        ['# Glossary', 'Intro text.'],
        'the intro is everything before the start marker',
    );
    t.same(
        doc.entries.map(entry => entry.term),
        ['adapter', 'chain'],
        'the terms are read in file order',
    );
    t.equal(doc.entries[0]?.definition, 'One. See [adapter](./adapter.md).', 'the definition');
    t.same(doc.malformed, [], 'nothing is malformed');
    t.end();
});

test('renderGlossary round-trips a document it produced', async t => {
    t.equal(renderGlossary(parseGlossary(DOC)), DOC, 'a canonical file is unchanged');
    t.end();
});

test('parseGlossary remembers a paragraph that is not an entry', async t => {
    const text = ['# Glossary', '', GLOSSARY_START, '', 'not an entry', '', GLOSSARY_END, ''].join(
        '\n',
    );
    const doc = parseGlossary(text);
    t.same(doc.entries, [], 'no entry is invented');
    t.same(doc.malformed, ['not an entry'], 'the paragraph is kept as malformed');
    t.end();
});

test('a missing marker pair is reported rather than guessed at', async t => {
    const doc = parseGlossary('# Glossary\n\n**adapter** — One. See [a](./a.md).\n');
    t.notOk(doc.marked, 'no markers');
    t.same(doc.entries, [], 'no entries are read without a region');
    t.end();
});

test('addEntry inserts in sorted position, case-insensitively', async t => {
    const doc = parseGlossary(DOC);
    t.equal(addTerm(doc, 'billing', 'Three. See [b](./billing.md).'), 'added', 'a new term');
    t.same(
        doc.entries.map(entry => entry.term),
        ['adapter', 'billing', 'chain'],
        'it lands between adapter and chain',
    );
    t.equal(addTerm(doc, 'API', 'The API. See [a](./api.md).'), 'added', 'another new term');
    t.same(
        doc.entries.map(entry => entry.term),
        ['adapter', 'API', 'billing', 'chain'],
        'API sorts under a',
    );
    t.end();
});

test('addEntry replaces the definition of a term that is already present', async t => {
    const doc = parseGlossary(DOC);
    t.equal(addTerm(doc, 'CHAIN', 'Updated. See [c](./chain.md).'), 'updated', 'case-insensitive');
    t.same(
        doc.entries.map(entry => entry.term),
        ['adapter', 'chain'],
        'no duplicate is added',
    );
    t.equal(findTerm(doc, 'chain')?.definition, 'Updated. See [c](./chain.md).', 'the definition');
    t.end();
});

test('removeEntry removes a term and reports one that is absent', async t => {
    const doc = parseGlossary(DOC);
    t.equal(removeTerm(doc, 'CHAIN'), 'chain', 'the term as it was written');
    t.same(
        doc.entries.map(entry => entry.term),
        ['adapter'],
        'it is gone',
    );
    t.equal(removeTerm(doc, 'notthere'), undefined, 'an absent term');
    t.end();
});

test('outOfOrder finds the first unsorted pair and sortEntries fixes it', async t => {
    const text = [
        '# Glossary',
        '',
        GLOSSARY_START,
        '',
        '**beta** — One. See [b](./beta.md).',
        '',
        '**alpha** — Two. See [a](./alpha.md).',
        '',
        GLOSSARY_END,
        '',
    ].join('\n');
    const doc = parseGlossary(text);
    t.same(outOfOrder(doc), {value: 'alpha', before: 'beta'}, 'the offending pair');
    sortTerms(doc);
    t.same(
        doc.entries.map(entry => entry.term),
        ['alpha', 'beta'],
        'sorted',
    );
    t.equal(outOfOrder(doc), undefined, 'and now in order');
    t.end();
});

test('linkTargets and localTarget tell a document link from a URL and an anchor', async t => {
    const text = 'See [a](./a.md), [b](https://x/y), [c](#anchor) and [d](../p/d.md#frag).';
    t.same(
        linkTargets(text),
        ['./a.md', 'https://x/y', '#anchor', '../p/d.md#frag'],
        'every link target, in order',
    );
    t.equal(localTarget('https://x/y'), null, 'a URL is external');
    t.equal(localTarget('#anchor'), null, 'an anchor is not a file');
    t.equal(localTarget('./a.md#frag'), './a.md', 'a fragment is stripped');
    t.end();
});

test('checkGlossary reports order, duplicates, length, missing links and dead links', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-glossary-doc-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    const file = join(dir, 'glossary.md');
    writeFileSync(join(dir, 'target.md'), '# Target\n');
    const long = `${'word '.repeat(45).trim()}. See [t](./target.md).`;
    const text = [
        '# Glossary',
        '',
        GLOSSARY_START,
        '',
        '**beta** — Short. See [t](./target.md).',
        '',
        `**alpha** — ${long}`,
        '',
        '**alpha** — Duplicate. See [missing](./nope.md).',
        '',
        '**gamma** — No link here.',
        '',
        GLOSSARY_END,
        '',
    ].join('\n');
    writeFileSync(file, text);
    const problems = checkGlossary(file, loadGlossary(file));
    const messages = problems
        .map(
            problem => `${problem.term === undefined ? '' : `${problem.term}: `}${problem.message}`,
        )
        .join('\n');
    t.match(messages, /not sorted: "alpha" follows "beta"/, 'order');
    t.match(messages, /alpha: duplicate term \(also as "alpha"\)/, 'duplicate');
    t.match(messages, /alpha: definition is \d+ words \(max \d+\)/, 'length');
    t.match(messages, /alpha: link does not resolve: \.\/nope\.md/, 'dead link');
    t.match(messages, /gamma: has no documentation link/, 'missing link');
    t.end();
});

test('checkGlossary accepts a well-formed document and flags a missing region', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-glossary-doc-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    const file = join(dir, 'glossary.md');
    writeFileSync(join(dir, 'target.md'), '# Target\n');
    writeFileSync(
        file,
        [
            '# Glossary',
            '',
            GLOSSARY_START,
            '',
            '**one** — Short. See [t](./target.md).',
            '',
            GLOSSARY_END,
            '',
        ].join('\n'),
    );
    t.same(checkGlossary(file, loadGlossary(file)), [], 'a good file has no problems');
    const unmarked = checkGlossary(file, parseGlossary('# Glossary\n'));
    t.ok(
        unmarked.some(problem => problem.message.includes(GLOSSARY_START)),
        'the missing region is reported',
    );
    t.end();
});
