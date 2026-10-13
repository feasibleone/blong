/**
 * memory-refs: ignore — the fixtures name ids that deliberately do not resolve, so the file that
 * tests the linter is the one file it cannot check.
 *
 * Unit tests for the cross-reference vocabulary (memory/memoryReference.ts).
 *
 * These are the checks CI enforces: the token grammar skips examples, the three
 * corpora resolve, a retired id is a warning that names its successor, and a
 * collision is an error. The tree is a throwaway repository whose `rush.json` makes
 * the temp directory the root, so nothing here touches the real memory files.
 */

import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import {
    buildReferenceIndex,
    markdownLinkSites,
    nearestAnchor,
    parseLineReferences,
    parseReferences,
    resolveReference,
    scanSites,
    slugOf,
    type IReferenceIndex,
} from './memoryReference.ts';

/** One entry, in the shape `parseDoc` reads. */
function entry(id: string, title: string, status = 'open'): string {
    return `### ${id} — ${title}\n\n> _2026-09-15 · cross-cutting · ${status}_\n\nThe body.\n`;
}

/** A throwaway repository with `rush.json` at its root. */
function tempRepo(projects: string[] = ['core/demo']): {dir: string; restore: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-refs-'));
    writeFileSync(
        join(dir, 'rush.json'),
        JSON.stringify({
            projects: projects.map(folder => ({packageName: folder, projectFolder: folder})),
        }),
    );
    const previous = process.cwd();
    process.chdir(dir);
    return {
        dir,
        restore: () => {
            process.chdir(previous);
            rmSync(dir, {recursive: true, force: true});
        },
    };
}

/** Write a file, creating its directories. */
function write(dir: string, relative: string, text: string): void {
    const path = join(dir, relative);
    mkdirSync(join(path, '..'), {recursive: true});
    writeFileSync(path, text);
}

t.test('slugOf matches GitHub heading anchors', t => {
    t.equal(slugOf('Searching by meaning'), 'searching-by-meaning');
    t.equal(slugOf('  The `@@` token  '), 'the--token');
    t.equal(slugOf('Layer defaults (table)'), 'layer-defaults-table');
    t.end();
});

t.test('parseLineReferences reads each target kind', t => {
    const tokens = parseLineReferences(
        'see @@F-014 and @@doc:patterns/memory#searching-by-meaning and @@skill:blong-realm#layers',
        3,
    );
    t.equal(tokens.length, 3, 'three tokens');
    t.same(tokens[0]?.target, {kind: 'entry', id: 'F-014'});
    t.same(tokens[1]?.target, {
        kind: 'doc',
        page: 'patterns/memory',
        anchor: 'searching-by-meaning',
    });
    t.same(tokens[2]?.target, {kind: 'skill', name: 'blong-realm', anchor: 'layers'});
    t.equal(tokens[0]?.line, 3, 'carries the line number');
    t.end();
});

t.test('parseReferences treats code formatting as examples', t => {
    const lines = [
        'A real reference @@F-014.',
        'An inline example `@@F-014` is skipped.',
        '```ts',
        '// a fenced example @@F-014 is skipped',
        '```',
    ];
    const tokens = parseReferences(lines);
    t.equal(tokens.length, 1, 'only the un-backticked token counts');
    t.equal(tokens[0]?.line, 1);
    t.end();
});

t.test('an entry resolves, and a collision is ambiguous', t => {
    const repo = tempRepo();
    try {
        write(
            repo.dir,
            '.github/memory/friction.md',
            `# Frictions\n\n## Open\n\n${entry('F-014', 'One')}`,
        );
        const index = buildReferenceIndex(repo.dir);
        const ok = resolveReference({kind: 'entry', id: 'F-014'}, index);
        t.equal(ok.code, 'ok');
        t.equal(ok.title, 'One');
        t.equal(ok.file, '.github/memory/friction.md');

        // A second file holding the same id makes the bare reference ambiguous.
        write(
            repo.dir,
            'core/demo/.github/memory/friction.md',
            `# Frictions\n\n## Open\n\n${entry('F-014', 'Two')}`,
        );
        const collided = resolveReference(
            {kind: 'entry', id: 'F-014'},
            buildReferenceIndex(repo.dir),
        );
        t.equal(collided.code, 'ambiguous', 'two holders');
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('a retired id is a warning that names its successor', t => {
    const repo = tempRepo();
    try {
        write(
            repo.dir,
            '.github/memory/friction.md',
            `# Frictions\n\n## Open\n\n${entry('F-090', 'The successor')}\n## Retired\n\n- F-101 — superseded by F-090 (2026-08-01)\n`,
        );
        const index = buildReferenceIndex(repo.dir);
        const retired = resolveReference({kind: 'entry', id: 'F-101'}, index);
        t.equal(retired.code, 'retired');
        t.equal(retired.successor, 'F-090');
        t.match(retired.message, /superseded by F-090/);
        t.equal(resolveReference({kind: 'entry', id: 'F-999'}, index).code, 'unknown');
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('a doc page and a skill resolve, section or not', t => {
    const repo = tempRepo();
    try {
        write(
            repo.dir,
            'docs/blong/docs/patterns/memory.md',
            '# Memory files\n\n## Searching by meaning\n\ntext\n',
        );
        write(
            repo.dir,
            '.github/skills/blong-realm/SKILL.md',
            '---\nname: blong-realm\n---\n\n# Realm\n\n## Layers\n\ntext\n',
        );
        const index = buildReferenceIndex(repo.dir);

        const page = resolveReference({kind: 'doc', page: 'patterns/memory'}, index);
        t.equal(page.code, 'ok');
        t.equal(page.title, 'Memory files');
        const section = resolveReference(
            {kind: 'doc', page: 'patterns/memory', anchor: 'searching-by-meaning'},
            index,
        );
        t.equal(section.code, 'ok');
        t.equal(section.line, 3, 'the anchor names its line');
        t.equal(
            resolveReference({kind: 'doc', page: 'patterns/memory', anchor: 'gone'}, index).code,
            'unknown',
        );
        t.equal(resolveReference({kind: 'doc', page: 'patterns/missing'}, index).code, 'unknown');
        t.equal(
            resolveReference({kind: 'skill', name: 'blong-realm', anchor: 'layers'}, index).code,
            'ok',
        );
        t.equal(resolveReference({kind: 'skill', name: 'blong-missing'}, index).code, 'unknown');
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('markdown links are checked, and fence examples are skipped', t => {
    const repo = tempRepo();
    try {
        write(repo.dir, 'docs/blong/docs/patterns/other.md', '# Other\n\n## A section\n');
        const file = 'docs/blong/docs/patterns/here.md';
        write(
            repo.dir,
            file,
            [
                '# Here',
                '',
                '[ok](other.md#a-section) [missing](nope.md) [bad](other.md#gone)',
                '',
                '```',
                '[example](nope.md) is skipped',
                '```',
            ].join('\n'),
        );
        const lines = readFileSync(join(repo.dir, file), 'utf8').split('\n');
        const sites = markdownLinkSites(repo.dir, file, lines);
        t.equal(sites.length, 3, 'the fenced example is skipped');
        t.equal(sites[0]?.code, 'ok');
        t.equal(sites[1]?.code, 'unknown');
        t.match(sites[1]?.message ?? '', /no file/);
        t.equal(sites[2]?.code, 'unknown');
        t.match(sites[2]?.message ?? '', /no section/);
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('a file can opt out with `memory-refs: ignore`', t => {
    const repo = tempRepo();
    try {
        write(repo.dir, 'src/real.ts', '// cites @@F-014\nexport const a = 1;\n');
        write(
            repo.dir,
            'plans/spike/sample.ts',
            '// memory-refs: ignore — negative example\n// @@F-999\nexport const b = 2;\n',
        );
        const index: IReferenceIndex = {
            entries: new Map(),
            docs: new Map(),
            skills: new Map(),
            ledger: new Map(),
        };
        const scanned = scanSites(repo.dir, ['src/real.ts', 'plans/spike/sample.ts'], index);
        t.equal(scanned.references.length, 1, 'only the file that did not opt out is scanned');
        t.equal(scanned.references[0]?.file, 'src/real.ts');
        t.equal(scanned.references[0]?.text, '// cites @@F-014', 'the line travels with the site');
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('a superseded decision resolves as a warning that names its successor', t => {
    const repo = tempRepo();
    try {
        mkdirSync(join(repo.dir, '.github/memory'), {recursive: true});
        writeFileSync(
            join(repo.dir, '.github/memory/decision.md'),
            [
                '# Decisions',
                '',
                '## Open',
                '',
                entry('D-042', 'The answer that stands'),
                entry('D-001', 'The answer that moved', 'superseded'),
                'Superseded by `D-042`.',
                '',
            ].join('\n'),
        );
        const index = buildReferenceIndex(repo.dir);
        const moved = resolveReference({kind: 'entry', id: 'D-001'}, index);
        t.equal(moved.code, 'superseded', 'the citation is not plain live reasoning');
        t.equal(moved.successor, 'D-042', 'the successor is carried for a retarget');
        t.match(moved.message, /moved to D-042/, 'and the message says where it moved');
        t.equal(
            resolveReference({kind: 'entry', id: 'D-042'}, index).code,
            'ok',
            'the successor itself resolves as live',
        );
        t.equal(
            resolveReference({kind: 'entry', id: 'D-999'}, index).code,
            'unknown',
            'and an absent id is still an error',
        );
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('a superseded entry with no successor resolves without one', t => {
    const repo = tempRepo();
    try {
        mkdirSync(join(repo.dir, '.github/memory'), {recursive: true});
        writeFileSync(
            join(repo.dir, '.github/memory/decision.md'),
            [
                '# Decisions',
                '',
                '## Superseded',
                '',
                entry('D-050', 'The question that settled', 'superseded'),
                '',
            ].join('\n'),
        );
        const resolution = resolveReference(
            {kind: 'entry', id: 'D-050'},
            buildReferenceIndex(repo.dir),
        );
        t.equal(resolution.code, 'superseded', 'still flagged');
        t.equal(resolution.successor, undefined, 'with nothing to retarget to');
        t.match(resolution.message, /names no successor/, 'which the message says');
    } finally {
        repo.restore();
    }
    t.end();
});

t.test('nearestAnchor offers a moved heading only when it is unambiguous', t => {
    const anchors = {'the-shape-of-an-entry': 17, 'adding-and-correcting-entries': 38};
    t.equal(
        nearestAnchor(anchors, 'the-shape-of-an-entr'),
        'the-shape-of-an-entry',
        'one close candidate is offered',
    );
    t.equal(
        nearestAnchor(anchors, 'adding-and-correcting-entrys'),
        'adding-and-correcting-entries',
        'a misspelt heading is repaired',
    );
    t.equal(
        nearestAnchor({'a-b': 1, 'a-c': 2}, 'a-d'),
        undefined,
        'two candidates at the same distance refuse to guess',
    );
    t.equal(nearestAnchor(anchors, 'a-wholly-different-heading'), undefined, 'an unrelated anchor');
    t.equal(
        nearestAnchor(anchors, 'the-shape-of-an-entries'),
        undefined,
        'a renamed heading is reported, not guessed at',
    );
    t.end();
});
