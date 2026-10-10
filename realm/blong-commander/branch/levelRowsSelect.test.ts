import {test} from 'tap';

import type {ICommanderLevel} from '../types.ts';
import {levelRowsSelect} from './levelRowsSelect.ts';

/**
 * The whitelist/blacklist a level declares decides which of its rows the explorer
 * shows, so these assertions are about the *selection* rather than about one source:
 * the Kubernetes namespace level is the caller that needs it (a cluster lists
 * whatever its own work created beside the namespaces Kubernetes itself owns), but
 * the mechanism is generic.
 */

/** A namespaced level, with whatever the caller's source declaration adds. */
const level = (overrides: Partial<ICommanderLevel> = {}): ICommanderLevel => ({
    resourceType: 'namespace',
    labelField: 'metadata.name',
    list: {method: 'k8s-dev.namespace.list', resultSet: 'items'},
    ...overrides,
});

/** Five rows, in the order the backend answered with. */
const rows = [
    {metadata: {name: 'blong-suite'}},
    {metadata: {name: 'default'}},
    {metadata: {name: 'kube-node-lease'}},
    {metadata: {name: 'kube-public'}},
    {metadata: {name: 'kube-system'}},
];

const names = (selected: unknown[]): unknown[] =>
    selected.map(row => (row as {metadata?: {name?: string}} | null)?.metadata?.name);

test('a level that declares no list keeps every row, and the same array', t => {
    t.equal(levelRowsSelect(level(), rows), rows, 'an unfiltered level pays nothing');
    t.end();
});

test('include is a whitelist: only the rows it names are shown', t => {
    t.same(
        names(levelRowsSelect(level({include: ['^default$', '^kube-']}), rows)),
        ['default', 'kube-node-lease', 'kube-public', 'kube-system'],
        'the namespaces Kubernetes itself owns, and nothing the cluster added',
    );
    t.end();
});

test('exclude is a blacklist: the rows it names are dropped', t => {
    t.same(
        names(levelRowsSelect(level({exclude: ['^blong-', '^kube-public$']}), rows)),
        ['default', 'kube-node-lease', 'kube-system'],
        'the cluster created blong-suite, and kube-public was named out',
    );
    t.end();
});

test('a row both lists name is dropped, because the blacklist is the narrower intent', t => {
    t.same(
        names(levelRowsSelect(level({include: ['^kube-'], exclude: ['^kube-public$']}), rows)),
        ['kube-node-lease', 'kube-system'],
        'admitted by the whitelist, then removed by the blacklist',
    );
    t.end();
});

test('an empty list filters nothing, so a pattern set can be emptied safely', t => {
    t.same(
        names(levelRowsSelect(level({include: []}), rows)),
        names(rows),
        'an empty whitelist admits every row',
    );
    t.same(
        names(levelRowsSelect(level({exclude: []}), rows)),
        names(rows),
        'an empty blacklist drops none',
    );
    t.end();
});

test('the pattern is matched against what the level displays', t => {
    t.same(
        names(
            levelRowsSelect(level({labelField: 'metadata.name', include: ['^kube-system$']}), rows),
        ),
        ['kube-system'],
        'the declared dot path reads through the raw row',
    );
    t.same(
        names(
            levelRowsSelect(
                level({
                    labelField: undefined,
                    keyField: 'metadata.name',
                    include: ['^kube-system$'],
                }),
                rows,
            ),
        ),
        ['kube-system'],
        'keyField answers when the level declares no labelField',
    );
    t.same(
        levelRowsSelect(
            level({labelField: undefined, keyField: undefined, include: ['^kube']}),
            rows,
        ),
        [],
        'a level that names no field has no value, so a pattern cannot match one',
    );
    t.end();
});

test('a row with no display value reads as an empty string, matched only on purpose', t => {
    const holey = [null, {metadata: null}, {metadata: {name: 'kube-system'}}];
    t.same(
        names(levelRowsSelect(level({include: ['^kube-system$']}), holey)),
        ['kube-system'],
        'a row the path cannot reach is not shown by a whitelist of names',
    );
    t.same(
        names(levelRowsSelect(level({include: ['^$']}), holey)),
        [undefined, undefined],
        'and it takes an explicit empty pattern to select those rows',
    );
    t.end();
});

test('a pattern that does not compile is reported, naming the level and the pattern', t => {
    t.throws(
        () => levelRowsSelect(level({include: ['[']}), rows),
        /invalid include regex "\[" on level 'namespace'/,
        'a broken whitelist is a configuration mistake, not an empty result',
    );
    t.throws(
        () => levelRowsSelect(level({exclude: ['(']}), rows),
        /invalid exclude regex "\(" on level 'namespace'/,
        'and a broken blacklist says which list it came from',
    );
    t.end();
});
