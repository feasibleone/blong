/**
 * Unit tests for the page and skill document builders (`hindsightPage.ts`).
 *
 * The invariant worth pinning is the id: it is the upsert key, so it must be derived
 * from the path and nothing else — a changing id would leave the previous text behind
 * as a second document, which is exactly what the "knowledge page" treatment exists
 * to prevent.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import {docsPageId, pageDocument, pageDocuments, skillPageId, slug} from './hindsightPage.ts';

t.test('slug joins runs of anything else with a single dash', t => {
    t.equal(slug('patterns/memory.md'), 'patterns-memory', 'a path loses its extension');
    t.equal(slug('Blong Handler'), 'blong-handler', 'case and spaces fold');
    t.equal(slug('a--b__c'), 'a-b-c', 'runs collapse');
    t.end();
});

t.test('docsPageId keeps the tier, so two overviews cannot collide', t => {
    t.equal(docsPageId('patterns/memory.md'), 'doc-patterns-memory');
    t.equal(docsPageId('rationale/memory.md'), 'doc-rationale-memory', 'the tier disambiguates');
    t.equal(docsPageId('concepts/naming.md'), 'doc-concepts-naming');
    t.end();
});

t.test('skillPageId prefers the declared name and falls back to the folder', t => {
    t.equal(
        skillPageId('blong-handler/SKILL.md', '---\nname: blong-handler\ndescription: x\n---\n'),
        'skill-blong-handler',
        'the front-matter name wins',
    );
    t.equal(
        skillPageId('blong-handler/SKILL.md', '# no front matter\n'),
        'skill-blong-handler',
        'the folder is the fallback, so a skill without front-matter still has an id',
    );
    t.equal(
        skillPageId('odd-folder/SKILL.md', '---\nname: the-real-name\n---\n'),
        'skill-the-real-name',
        'a renamed folder does not re-key the page',
    );
    t.end();
});

t.test('a documentation page carries the taxonomy the entries are told apart by', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-page-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    const file = join(dir, 'patterns', 'memory.md');
    mkdirSync(join(dir, 'patterns'), {recursive: true});
    writeFileSync(file, '# Memory files\n\nHow the notes work.\n');

    const document = pageDocument(dir, {
        kind: 'docs',
        path: file,
        relativePath: 'patterns/memory.md',
        tier: 'patterns',
    });

    t.equal(document.documentId, 'doc-patterns-memory', 'the page id is the upsert key');
    t.equal(
        document.content,
        '# Memory files\n\nHow the notes work.\n',
        'the page is stored verbatim',
    );
    t.equal(
        document.context,
        'Project Documentation: patterns/memory.md',
        'the context names the file',
    );
    t.ok(document.tags.includes('type:documentation'), 'it is a documentation page');
    t.ok(document.tags.includes('stability:stable'), 'and stable state, not an event');
    t.ok(document.tags.includes('tier:patterns'), 'the tier is a filterable dimension');
    t.notOk(document.tags.includes('memory'), 'a page must not answer an entry search');
    t.equal(document.metadata['type'], 'documentation', 'the metadata mirrors the tags');
    t.ok(document.timestamp, 'and it carries a modification time');
    t.end();
});

t.test('a skill carries the procedural tags', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-page-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    const file = join(dir, 'blong-handler', 'SKILL.md');
    mkdirSync(join(dir, 'blong-handler'), {recursive: true});
    writeFileSync(file, '---\nname: blong-handler\ndescription: Handlers.\n---\n\n# Handlers\n');

    const document = pageDocument(dir, {
        kind: 'skill',
        path: file,
        relativePath: 'blong-handler/SKILL.md',
    });

    t.equal(document.documentId, 'skill-blong-handler', 'the skill id names the workflow');
    t.equal(
        document.context,
        'Agent Skill Procedure: blong-handler/SKILL.md',
        'the context names it',
    );
    t.ok(document.tags.includes('type:agent-skill'), 'it is an agent skill');
    t.ok(document.tags.includes('scope:behavioral-instruction'), 'systemic behaviour, not a log');
    t.ok(document.tags.includes('execution:procedural'), 'procedural, not factual');
    t.notOk(document.tags.includes('memory'), 'a skill must not answer an entry search');
    t.match(
        document.content,
        /^---/,
        'the front-matter stays: its description is the routing text',
    );
    t.end();
});

t.test('pageDocuments keeps the order it is given', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-page-'));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    writeFileSync(join(dir, 'a.md'), '# a\n');
    writeFileSync(join(dir, 'b.md'), '# b\n');

    const documents = pageDocuments(dir, [
        {kind: 'docs', path: join(dir, 'a.md'), relativePath: 'patterns/a.md', tier: 'patterns'},
        {kind: 'docs', path: join(dir, 'b.md'), relativePath: 'patterns/b.md', tier: 'patterns'},
    ]);
    t.same(
        documents.map(document => document.documentId),
        ['doc-patterns-a', 'doc-patterns-b'],
        'the order of the sources is the order of the documents',
    );
    t.end();
});
