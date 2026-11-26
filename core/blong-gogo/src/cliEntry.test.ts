import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {test} from 'tap';

import {isCliEntry, sameFile} from './cli.ts';

/**
 * The entry guard, which is the one piece of the CLI plumbing a wrong answer makes invisible.
 *
 * A guard that answers false in the right place is correct — a test imports a `bin/*.ts` and nothing
 * runs. A guard that answers false in the *wrong* place is silent: the module imports its realm, skips
 * the command and exits 0. That is what a package manager's bin shim produced, because it starts node
 * with the path through `node_modules/<pkg>` while the module's own URL is the file it links to.
 */
await test('two names for one file are one entry point', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-entry-'));
    try {
        const real = join(dir, 'bin.ts');
        writeFileSync(real, '// the file a bin points at\n');
        const link = join(dir, 'the-bin');
        symlinkSync(real, link);
        mkdirSync(join(dir, 'other'));
        const other = join(dir, 'other', 'bin.ts');
        writeFileSync(other, '// a different file with the same basename\n');

        t.ok(sameFile(real, link), 'a symlink and its target are one file');
        t.ok(sameFile(link, real), 'in either order');
        t.equal(sameFile(real, other), false, 'and two files are two, however alike their names');
        t.equal(
            sameFile(join(dir, 'missing'), join(dir, 'missing')),
            true,
            'a path that does not exist compares as itself rather than throwing',
        );
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

await test('a module that is not the entry point runs nothing', async t => {
    // The other half of the guard, written so it holds whatever the runner's own `argv[1]` is — tap
    // starts a file as the entry, so asserting on *this* file would be asserting on the runner.
    const dir = mkdtempSync(join(tmpdir(), 'cli-entry-'));
    try {
        const other = join(dir, 'other.ts');
        writeFileSync(other, '// nobody started this\n');
        t.equal(
            isCliEntry(pathToFileURL(other).href),
            false,
            'a URL that is not the process entry point answers false, which is what keeps a realm out of a test',
        );
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
