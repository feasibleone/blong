/**
 * `createRealm` — the runtime scaffolder `blong realm <name>` and the suite
 * auto-trigger both take.
 *
 * What is asserted here is the *name* the template is rendered with. A realm
 * folder is `blong-<realm>` in this monorepo (the package name carries the same
 * prefix), while the template substitutes the bare realm name into identifiers
 * (`async function marineFixture`), unquoted object keys, file names and the
 * method names derived from its seed files. Substituting the folder name
 * verbatim therefore produced `async function blong-marineFixture()` — a realm
 * that parsed nowhere near as early as it failed.
 *
 * The scaffold itself needs no dependencies: the template is read from the
 * sibling `blong-kopi` package and written to a temp folder, so this suite never
 * touches the repository or the database.
 */

import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {createRealm} from './kopi.ts';

/** The scaffolded realm, read back as text. */
const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');

test('createRealm renders the realm name from a blong- prefixed folder', async t => {
    const root = mkdtempSync(join(tmpdir(), 'blong-realm-'));
    try {
        const files = await createRealm(join(root, 'blong-marine'));
        const realm = join(root, 'blong-marine');

        t.ok(files.length >= 20, `the realm tree is written (${files.length} files)`);
        t.match(
            read(realm, 'orchestrator/subject/init.ts'),
            /namespace: 'marine'/,
            'the subject namespace is the bare realm name',
        );
        t.match(
            read(realm, 'meta/fixture/marineFixture.ts'),
            /async function marineFixture/,
            'a generated identifier does not carry the folder prefix',
        );
        t.match(
            read(realm, 'meta/model/marineEntryModel.ts'),
            /subject: 'marine'/,
            'the model is registered on the same namespace',
        );
        t.match(
            read(realm, 'src/stories/Marine.stories.tsx'),
            /export const Marine = portal\(\)/,
            'the portal story exports a valid identifier',
        );
        t.ok(existsSync(join(realm, 'test/marine.play.ts')), 'the Playwright spec is named for it');
        t.ok(
            !existsSync(join(realm, '.github/memory')),
            'the template contributes no memory of its own',
        );

        const pkg = JSON.parse(read(realm, 'package.json')) as {name: string; version: string};
        t.equal(pkg.name, '@feasibleone/blong-marine', 'the package keeps the prefix once');
        t.equal(pkg.version, '0.1.0', 'a scaffold starts at its own version');
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});

test('createRealm accepts a bare folder name too', async t => {
    const root = mkdtempSync(join(tmpdir(), 'blong-realm-'));
    try {
        await createRealm(join(root, 'marine'));
        t.match(
            read(join(root, 'marine'), 'orchestrator/subject/init.ts'),
            /namespace: 'marine'/,
            'the folder name is the realm name when it carries no prefix',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});

test('createRealm refuses a name it cannot substitute, before writing', async t => {
    const root = mkdtempSync(join(tmpdir(), 'blong-realm-'));
    try {
        await t.rejects(
            createRealm(join(root, 'my-shop')),
            /single lowercase word/,
            'a folder name that is not an identifier is refused with the reason',
        );
        t.notOk(existsSync(join(root, 'my-shop')), 'and nothing is written');
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});
