/**
 * Unit tests for the memory-path helpers (`memoryPaths.ts`).
 *
 * The case that matters: memory may predate its package. A folder that already
 * carries `.github/memory` is a valid area even though `rush.json` does not list
 * it yet, because a realm is planned — and its decisions recorded — before the
 * scaffold writes the folder.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import {isKnownArea, listMemoryFiles, packageAreas, scopeOf} from './memoryPaths.ts';

/** A workspace with one rush project and one folder that is not a package yet. */
function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'blong-memory-paths-'));
    writeFileSync(
        join(dir, 'rush.json'),
        JSON.stringify({projects: [{packageName: 'x', projectFolder: 'core/x'}]}, null, 2),
    );
    mkdirSync(join(dir, 'realm/future/.github/memory'), {recursive: true});
    writeFileSync(
        join(dir, 'realm/future/.github/memory/decision.md'),
        '# Decisions — realm/future\n',
    );
    return dir;
}

test('a folder that holds memory is an area before it is a package', async t => {
    const root = workspace();
    t.same(
        packageAreas(root),
        ['core/x', 'realm/future'],
        'rush projects first, then the folder that already has memory',
    );
    t.equal(isKnownArea(root, 'realm/future'), true, 'valid area');
    t.equal(isKnownArea(root, 'realm/absent'), false, 'a folder with no memory is still unknown');
    t.same(
        listMemoryFiles(root).map(ref => ref.scope),
        ['realm/future'],
        'its files are discovered',
    );
    rmSync(root, {recursive: true, force: true});
    t.end();
});

test('a reserved label still resolves to the root scope', async t => {
    t.equal(scopeOf('docs'), 'root', 'reserved area');
    t.equal(scopeOf('realm/blong-sport'), 'realm/blong-sport', 'package area');
    t.end();
});
