/**
 * Unit tests for the source vocabulary and the tree walk (`hindsightSources.ts`).
 *
 * The walk decides which files an ingestion owns and which a reconcile may delete, so
 * the invariants worth pinning are that discovery is stable and that nothing outside
 * the named tiers and skill folders is ever picked up — a walk that reached `img/` or
 * the blog would ingest files the docs build does not publish.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import {
    SOURCE_TAG,
    discoverPages,
    pageSourceOf,
    parseSources,
    sourceTags,
} from './hindsightSources.ts';

/** A repository skeleton with a documentation tree and a skills tree. */
function tree(t: {teardown: (cleanup: () => void) => void}): string {
    const root = mkdtempSync(join(tmpdir(), 'blong-sources-'));
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    const docs = join(root, 'docs/blong/docs');
    mkdirSync(join(docs, 'patterns'), {recursive: true});
    mkdirSync(join(docs, 'rationale'), {recursive: true});
    mkdirSync(join(docs, 'img'), {recursive: true});
    writeFileSync(join(docs, 'intro.md'), '# intro\n');
    writeFileSync(join(docs, 'patterns/memory.md'), '# memory\n');
    writeFileSync(join(docs, 'rationale/memory.md'), '# rationale\n');
    writeFileSync(join(docs, 'img/diagram.md'), '# not a page\n');
    writeFileSync(join(docs, 'patterns/notes.txt'), 'not markdown\n');

    const skills = join(root, '.github/skills');
    mkdirSync(join(skills, 'blong-handler'), {recursive: true});
    mkdirSync(join(skills, 'scratch'), {recursive: true});
    writeFileSync(join(skills, 'blong-handler/SKILL.md'), '---\nname: blong-handler\n---\n');
    writeFileSync(join(skills, 'blong-handler/references.md'), '# a reference\n');
    return root;
}

t.test('parseSources reads a comma list and refuses anything else', t => {
    t.same(parseSources('docs,skill').sources, ['docs', 'skill'], 'a comma list');
    t.same(parseSources(' entry ').sources, ['entry'], 'space is trimmed');
    t.same(parseSources('docs,docs').sources, ['docs'], 'a repeat is one source');
    t.same(parseSources('entry,docs,skill').sources, ['entry', 'docs', 'skill'], 'all three');
    t.match(parseSources('nope').problems, [/unknown source "nope"/], 'an unknown name is named');
    t.match(parseSources('').problems, [/--sources needs one of/], 'an empty value is a problem');
    t.same(parseSources('nope').sources, [], 'and nothing is selected');
    t.end();
});

t.test('sourceTags names the tags a reconcile owns', t => {
    t.same(sourceTags(['entry']), [SOURCE_TAG.entry], 'the entry stream');
    t.same(sourceTags(['docs', 'skill']), ['kind:documentation', 'kind:agent-skill'], 'the pages');
    t.end();
});

t.test('discoverPages walks the tiers and the skill folders, and nothing else', t => {
    const root = tree(t);
    const pages = discoverPages(root, ['docs', 'skill']);

    t.same(
        pages.map(page => page.relativePath).sort(),
        ['blong-handler/SKILL.md', 'patterns/memory.md', 'rationale/memory.md'],
        'the tier pages and the skills, in a stable order',
    );
    t.ok(
        !pages.some(page => page.relativePath.includes('img/')),
        'a file in the img folder is not a page',
    );
    t.ok(
        !pages.some(page => page.relativePath.includes('intro.md')),
        'the docs root index is not a tier page',
    );
    t.ok(
        !pages.some(page => page.relativePath.includes('notes.txt')),
        'a non-markdown file in a tier is not a page',
    );
    t.ok(
        !pages.some(page => page.relativePath.includes('references.md')),
        'a skill reference is not a SKILL.md',
    );
    t.equal(pages.find(page => page.kind === 'docs')?.tier, 'patterns', 'a page knows its tier');
    t.end();
});

t.test('discoverPages honours the selection', t => {
    const root = tree(t);
    t.same(
        discoverPages(root, ['docs']).map(page => page.kind),
        ['docs', 'docs'],
        'docs only',
    );
    t.same(
        discoverPages(root, ['skill']).map(page => page.relativePath),
        ['blong-handler/SKILL.md'],
        'skills only',
    );
    (t.same(discoverPages(root, ['entry']), [], 'entries are not pages — they come from the tree'),
        t.end());
});

t.test('pageSourceOf recognises exactly the pages of the tree', t => {
    const root = tree(t);
    t.equal(
        pageSourceOf(root, join(root, 'docs/blong/docs/patterns/memory.md'))?.relativePath,
        'patterns/memory.md',
        'a tier page is recognised, with its tier',
    );
    t.equal(
        pageSourceOf(root, join(root, '.github/skills/blong-handler/SKILL.md'))?.kind,
        'skill',
        'a SKILL.md is a skill',
    );
    t.equal(
        pageSourceOf(root, join(root, '.github/memory/friction.md')),
        null,
        'a memory file is not a page',
    );
    t.equal(
        pageSourceOf(root, join(root, 'docs/blong/docs/img/diagram.md')),
        null,
        'nor is a file outside the tiers',
    );
    t.equal(
        pageSourceOf(root, join(root, 'docs/blong/docs/patterns/notes.txt')),
        null,
        'nor a file the tools would not read',
    );
    t.end();
});
