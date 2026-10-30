/**
 * Tests for the per-package mock port (utils/mockPort.ts).
 *
 * The derivation is a contract with two other places — the mock that binds the
 * port and the realm config that tells the browser where it is — so what is
 * asserted here is only that the *number* is the package's own and that an
 * explicit choice is never overruled.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {MOCK_PORT_BASE, MOCK_PORT_VAR, mockPortEnv, mockPortForPackage} from './mockPort.ts';

/** A throwaway tree: `rush.json` at the root, one package per name. */
function workspace(projects: string[], pkgName: string): {root: string; pkg: string} {
    const root = mkdtempSync(join(tmpdir(), 'blong-mock-port-'));
    writeFileSync(
        join(root, 'rush.json'),
        [
            '/**',
            ' * Comments are legal in rush.json, and the parser strips them.',
            ' */',
            JSON.stringify(
                {rushVersion: '5.0.0', projects: projects.map(name => ({packageName: name}))},
                null,
                2,
            ),
        ].join('\n'),
    );
    const pkg = join(root, 'realm', pkgName.replace('@fixture/', ''));
    mkdirSync(pkg, {recursive: true});
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({name: pkgName}));
    return {root, pkg};
}

test('a package gets a port above the gateway and front-end bands', async t => {
    const {root, pkg} = workspace(['@fixture/first', '@fixture/second'], '@fixture/second');
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    const port = mockPortForPackage(pkg);
    t.equal(port, MOCK_PORT_BASE + 1, 'the port is the base plus the package index');
    t.ok(port! > 9151, 'above every gateway (90xx) and front-end (91xx) port a run derives');
});

test('two packages of one workspace get different ports', async t => {
    const {root, pkg} = workspace(['@fixture/first', '@fixture/second'], '@fixture/second');
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    const first = mockPortForPackage(join(root, 'realm', 'first'));

    t.not(first, mockPortForPackage(pkg), 'sibling packages do not share a mock port');
});

test('outside a Rush workspace there is no derived port', async t => {
    const root = mkdtempSync(join(tmpdir(), 'blong-mock-port-'));
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    writeFileSync(join(root, 'package.json'), JSON.stringify({name: '@fixture/standalone'}));

    t.equal(mockPortForPackage(root), null, 'a published realm keeps its own default');
});

test('a package that is not in rush.json is left alone', async t => {
    const {root, pkg} = workspace(['@fixture/listed'], '@fixture/unlisted');
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.equal(mockPortForPackage(pkg), null, 'an unlisted folder resolves to no port');
});

test('an explicit value wins over the derived one', async t => {
    const {root, pkg} = workspace(['@fixture/first', '@fixture/second'], '@fixture/second');
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    const env = mockPortEnv(pkg, {[MOCK_PORT_VAR]: '9999'});
    t.equal(env[MOCK_PORT_VAR], '9999', 'the caller chooses the port');
});

test('the derived value is added to the environment', async t => {
    const {root, pkg} = workspace(['@fixture/first', '@fixture/second'], '@fixture/second');
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    const env = mockPortEnv(pkg, {});
    t.equal(env[MOCK_PORT_VAR], String(MOCK_PORT_BASE + 1), 'the child inherits the package port');
});
