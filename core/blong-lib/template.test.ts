import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'tap';

import {
    isStampedFile,
    listTemplateFiles,
    SCAFFOLD_VERSION,
    scaffoldManifest,
    scaffoldPackageName,
    scaffoldSubject,
} from './template.ts';

/**
 * The template enumeration is the one thing every scaffolder agrees on, so what
 * it excludes — and what the realm's manifest becomes — is asserted here rather
 * than once per consumer.
 */

/** Create `path` (and its parents) under `root`, with empty content. */
function place(root: string, path: string): void {
    mkdirSync(dirname(join(root, path)), {recursive: true});
    writeFileSync(join(root, path), '');
}

test("listTemplateFiles skips generated output and another package's memory", t => {
    const root = mkdtempSync(join(tmpdir(), 'blong-template-'));
    try {
        for (const path of [
            'package.json',
            'browser.ts',
            'src/stories/Item.stories.tsx',
            // Per-package artifacts: a realm regenerates its own.
            '.ci-report/report.json',
            'coverage/index.html',
            'storybook-static/index.html',
            'allure-report/index.html',
            '.playwright/report/index.html',
            'test/item.play.ts-snapshots/browse.png',
            'node_modules/pkg/index.js',
            // The template's own development memory describes scaffolding this
            // package — it is not content of a realm scaffolded from it.
            '.github/memory/todo.md',
            '.github/memory/nested/decision.md',
            '.github/kukum.yml',
        ]) {
            place(root, path);
        }

        t.same(
            listTemplateFiles(root).sort(),
            ['.github/kukum.yml', 'browser.ts', 'package.json', 'src/stories/Item.stories.tsx'],
            'template content is enumerated, generated output and memory are not',
        );
        t.same(
            listTemplateFiles(root, {extraIgnore: ['package.json']}).sort(),
            ['.github/kukum.yml', 'browser.ts', 'src/stories/Item.stories.tsx'],
            'a consumer can still skip more (createRealm writes its own manifest)',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});

test('isStampedFile covers the sources a scaffolder owns', t => {
    t.equal(isStampedFile('server.ts'), true, 'a handler is stamped');
    t.equal(isStampedFile('src/stories/Item.stories.tsx'), true, 'a story is stamped');
    t.equal(isStampedFile('meta/dbTest/accessAuthorizationMerge.yaml'), false, 'a seed is not');
    t.equal(isStampedFile('package.json'), false, 'the manifest is not');
    t.equal(isStampedFile('meta/db/procedure.sql'), false, 'a procedure is not');
    t.end();
});

test('scaffoldSubject is the folder name without its package prefix', t => {
    t.equal(scaffoldSubject('marine'), 'marine', 'a bare folder name is the realm name');
    t.equal(
        scaffoldSubject('blong-marine'),
        'marine',
        'the monorepo folder convention drops the blong- prefix',
    );
    t.equal(scaffoldSubject('blong'), 'blong', 'the prefix only counts with its dash');
    t.equal(scaffoldSubject('shop2'), 'shop2', 'digits are fine after the first character');

    // The realm name is substituted into identifiers, so a name that cannot be
    // one is refused before a broken realm is written.
    for (const folder of ['my-shop', 'MyRealm', 'blong-', 'blong-my-shop', '2shop', '']) {
        t.throws(
            () => scaffoldSubject(folder),
            /single lowercase word/,
            `'${folder}' is refused with the reason`,
        );
    }
    t.end();
});

test('scaffoldPackageName follows the monorepo convention', t => {
    t.equal(scaffoldPackageName('marine'), '@feasibleone/blong-marine');
    t.equal(
        scaffoldPackageName('blong-marine'),
        '@feasibleone/blong-marine',
        'a folder already named blong-<realm> is not prefixed twice',
    );
    t.end();
});

test('scaffoldManifest rewrites the fields that describe the template', t => {
    // Shape of the template's own manifest, trimmed to what matters here.
    const manifest = `{
    "name": "@feasibleone/blong-kopi",
    "version": "1.16.0",
    "description": "Realm scaffolding template — scaffolds a new realm",
    "type": "module",
    "dependencies": {
        "@feasibleone/blong": "workspace:^1.0.0"
    }
}
`;
    const realm = scaffoldManifest(manifest, 'marine');

    t.same(JSON.parse(realm), {
        name: '@feasibleone/blong-marine',
        version: SCAFFOLD_VERSION,
        description: 'marine realm',
        type: 'module',
        dependencies: {'@feasibleone/blong': 'workspace:^1.0.0'},
    });
    t.match(realm, /^ {4}"name": "@feasibleone\/blong-marine",$/m, 'formatting survives');
    t.match(realm, /^ {4}"version": "0\.1\.0",$/m, "the version is the scaffold's own");
    t.notMatch(realm, /kopi/, 'nothing in the manifest still names the template');
    t.end();
});
