/**
 * Unit tests for id resolution across memory files.
 *
 * The rules decide which entry a command acts on, so they are tested as plain
 * functions of the hits and the current directory: no repository, no filesystem.
 * The command layer's own behaviour (the refusal message, the qualified edit) is
 * covered end to end in `commands/memory.test.ts`.
 */

import {join} from 'node:path';
import t from 'tap';

import type {IMemoryFileRef} from './memoryPaths.ts';
import {parseId, resolveId, scopeForCwd, type IIdHit} from './memoryResolve.ts';
import type {IMemoryEntry} from './memoryTypes.ts';

/** An entry as the parser would report it, with the parts under test filled in. */
function entry(id: string, title: string): IMemoryEntry {
    return {
        id,
        title,
        meta: {date: '2026-01-01', area: 'cross-cutting', status: 'open'},
        body: [],
        start: 0,
        end: 0,
        section: 'Open',
    };
}

/** An id found in one file. */
function hit(scope: string, id = 'T-001', title = 'A task'): IIdHit {
    const file: IMemoryFileRef = {
        path: join('/repo', scope === 'root' ? '' : scope, '.github/memory/todo.md'),
        kind: 'todo',
        scope,
    };
    return {file, entry: entry(id, title)};
}

t.test('parseId', async t => {
    t.same(parseId('t-229'), {id: 'T-229', scope: null}, 'a bare id is upper-cased');
    t.same(
        parseId('T-229@core/blong-gogo'),
        {id: 'T-229', scope: 'core/blong-gogo'},
        'the scope follows the @',
    );
    t.same(parseId('T-229@root'), {id: 'T-229', scope: 'root'}, 'the root scope is a scope');
    t.same(
        parseId('T-229@core/blong-gogo/'),
        {id: 'T-229', scope: 'core/blong-gogo'},
        'a trailing slash is not part of the scope',
    );
    t.same(parseId('@scope'), {id: '@SCOPE', scope: null}, 'an id with no @ is left whole');
});

t.test('scopeForCwd', async t => {
    const root = '/repo';
    const scopes = ['root', 'core/blong-gogo', 'realm/blong-kustomize'];

    t.equal(scopeForCwd(root, root, scopes), null, 'the repository root speaks for no package');
    t.equal(
        scopeForCwd(join(root, 'realm/blong-kustomize'), root, scopes),
        'realm/blong-kustomize',
        'a command run in a package speaks for it',
    );
    t.equal(
        scopeForCwd(join(root, 'realm/blong-kustomize/server/test'), root, scopes),
        'realm/blong-kustomize',
        'and so does one run deeper inside it',
    );
    t.equal(
        scopeForCwd(join(root, 'realm'), root, scopes),
        null,
        'a directory that only encloses packages is not one of them',
    );
    t.equal(
        scopeForCwd(join(root, 'realm/blong-kustomize-extra'), root, scopes),
        null,
        'a folder whose name merely starts the same is not inside it',
    );
    t.equal(
        scopeForCwd(join(root, 'core/blong-gogo/db'), root, ['root', 'core', 'core/blong-gogo']),
        'core/blong-gogo',
        'a package inside another package answers for itself',
    );
});

t.test('resolveId', async t => {
    t.same(
        resolveId(parseId('T-001'), [], null),
        {hits: [], how: 'missing'},
        'an id nothing holds is missing',
    );

    const only = hit('core/blong-gogo');
    t.equal(
        resolveId(parseId('T-001'), [only], null).how,
        'unique',
        'one file holding the id is an answer',
    );

    const one = hit('core/blong-gogo', 'T-001', 'The framework task');
    const two = hit('realm/blong-kustomize', 'T-001', 'The realm task');

    t.equal(
        resolveId(parseId('T-001'), [one, two], null).how,
        'ambiguous',
        'two files holding a bare id is not answered',
    );
    t.same(
        resolveId(parseId('T-001'), [one, two], null).hits.map(found => found.file.scope),
        ['core/blong-gogo', 'realm/blong-kustomize'],
        'and every file that holds it is offered',
    );

    const scoped = resolveId(parseId('T-001@realm/blong-kustomize'), [one, two], null);
    t.equal(scoped.how, 'scope', 'a qualified id is resolved by its scope');
    t.equal(scoped.hit?.entry.title, 'The realm task', 'to that scope\u2019s entry');

    const missed = resolveId(parseId('T-001@realm/blong-commander'), [one, two], null);
    t.equal(missed.how, 'scope-miss', 'a scope that does not hold the id does not borrow another');
    t.equal(missed.scope, 'realm/blong-commander', 'and the message can name the scope asked for');
    t.equal(missed.hits.length, 2, 'while still listing where the id does live');

    const preferred = resolveId(parseId('T-001'), [one, two], 'core/blong-gogo');
    t.equal(preferred.how, 'preferred', 'the package the command runs from answers for its own id');
    t.equal(preferred.hit?.entry.title, 'The framework task', 'with its entry');

    const elsewhere = resolveId(parseId('T-001'), [one, two], 'realm/blong-commander');
    t.equal(elsewhere.how, 'ambiguous', 'a package that holds no such id leaves the refusal');

    const twice = resolveId(
        parseId('T-001'),
        [one, hit('core/blong-gogo', 'T-001', 'Again')],
        null,
    );
    t.equal(twice.how, 'ambiguous', 'an id written twice is ambiguous even in one scope');
    t.equal(twice.hits.length, 2, 'with both of its places listed');
});
