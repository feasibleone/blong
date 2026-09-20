import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import Module, {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {server} from '@feasibleone/blong';
import {test} from 'tap';

import load from './loadServer.ts';

/**
 * Which realms the framework loads beside a suite is decided by the suite's
 * *manifest*, not by what happens to resolve.
 *
 * The two questions look like one, and only differ when the ambient resolution
 * lies: `createRequire(...).resolve()` falls back to `NODE_PATH`, and the tap
 * runner points that at the pnpm store — where every workspace package can be
 * found, including a published copy of blong-server. Under `blong-dev test` the
 * framework therefore loaded realms into suites that declare none of them, and
 * `demo/blong-cli` (a command that runs on the `cli` intent and reads no
 * database) died with `Unknown database 'blong-cli'` (F-206).
 *
 * The fixture below reproduces exactly that shape without touching the runner:
 * a package the ambient resolution can find, a suite beside a manifest that does
 * or does not declare it, and one assertion per case. The realm that loads is a
 * marker realm of its own rather than the real blong-server, which would want a
 * database and a database name of its own.
 */

/**
 * The marker realm the fake blong-server package exports.
 *
 * A realm is a factory carrying the framework's `kind` symbol, and the symbol is
 * registered with `Symbol.for`, so a fixture can be a realm without reaching for
 * `@feasibleone/blong` — which is what lets it live in a tmp directory. It is CJS
 * because the runner transpiles the suite to CJS, so the loader's `import()` of
 * it is a `require()`, and requiring an ES module from there is a cycle.
 */
const MARKER_REALM = `const Kind = Symbol.for('blong:kind');

module.exports = Object.defineProperty(
    () => ({
        url: require('node:url').pathToFileURL(__filename).href,
        pkg: {name: 'blong-server', version: '0.0.0'},
        config: {default: {}},
    }),
    Kind,
    {value: 'solution'},
);
`;

/**
 * A directory that is both the suite's home and a `NODE_PATH` entry.
 *
 * `node_modules/@feasibleone/blong-server` is the package the ambient resolution
 * answers with, and its `exports` maps the pinned `/server.ts` subpath onto the
 * marker realm above. `suite.ts` is named by the suite's `url` but never
 * imported: it only gives `createRequire(suiteUrl)('./package.json')` a directory
 * to resolve the suite's manifest in.
 */
function fixture(declaresMarker: boolean): {url: string; dispose: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-framework-realms-'));
    const marker = join(dir, 'node_modules', '@feasibleone', 'blong-server');
    mkdirSync(marker, {recursive: true});
    writeFileSync(
        join(marker, 'package.json'),
        JSON.stringify({name: 'blong-server', exports: {'./server.ts': './server.cjs'}}),
    );
    writeFileSync(join(marker, 'server.cjs'), MARKER_REALM);
    writeFileSync(join(dir, 'suite.ts'), '');
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
            name: 'framework-realms-fixture',
            version: '0.0.0',
            ...(declaresMarker ? {dependencies: {'@feasibleone/blong-server': '1.0.0'}} : {}),
        }),
    );
    return {
        url: pathToFileURL(join(dir, 'suite.ts')).href,
        dispose: () => rmSync(dir, {recursive: true, force: true}),
    };
}

/**
 * Run `body` with `dir` on the module paths Node resolves against, which is the
 * effect `NODE_PATH` has in a child process. `globalPaths` is read on every
 * resolve, so pushing onto it is enough — no re-init and no environment
 * manipulation, and the entry is taken back off afterwards.
 */
async function withAmbientResolution<T>(dir: string, body: () => Promise<T>): Promise<T> {
    const {globalPaths} = Module as unknown as {globalPaths: string[]};
    const path = join(dir, 'node_modules');
    globalPaths.unshift(path);
    try {
        return await body();
    } finally {
        globalPaths.splice(globalPaths.indexOf(path), 1);
    }
}

/**
 * A suite that names no children: everything it loads, it loads because its
 * manifest declares it — or because the ambient resolution found it, which is
 * the bug this asserts against.
 */
const suite = (url: string, pkg?: {name: string; version: string}) =>
    server(
        () =>
            ({
                url,
                ...(pkg ? {pkg} : {}),
                children: [],
                config: {default: {}},
            }) as never,
    );

test('a realm the suite does not declare is not loaded, though NODE_PATH resolves it', async t => {
    const {url, dispose} = fixture(false);
    try {
        await withAmbientResolution(dirname(fileURLToPath(url)), async () => {
            // The premise: the marker realm *is* resolvable from the suite's own
            // location, so the loader would have loaded it had it asked by
            // resolution.
            t.match(
                createRequire(url).resolve('@feasibleone/blong-server/server.ts'),
                /blong-server/,
                'the ambient resolution finds the realm the suite does not declare',
            );
            const registry = await load(suite(url) as never, 'undeclared', {}, ['cli']);
            t.notOk(
                registry.describe?.().realms.includes('server'),
                'and the loader leaves it out',
            );
        });
    } finally {
        dispose();
    }
});

test('a realm the suite declares is loaded', async t => {
    const {url, dispose} = fixture(true);
    try {
        await withAmbientResolution(dirname(fileURLToPath(url)), async () => {
            const registry = await load(suite(url) as never, 'declared', {}, ['cli']);
            t.ok(
                registry.describe?.().realms.includes('server'),
                'the declared realm is loaded',
            );
        });
    } finally {
        dispose();
    }
});

test('a trimmed manifest does not un-declare a realm', async t => {
    // `blong-suite/server.ts` passes `{name, version}` and nothing else, so the
    // dependencies only exist in the file beside it. Reading the trimmed manifest as
    // the whole answer would drop the realm that suite depends on.
    const {url, dispose} = fixture(true);
    try {
        await withAmbientResolution(dirname(fileURLToPath(url)), async () => {
            const registry = await load(
                suite(url, {name: 'framework-realms-fixture', version: '0.0.0'}) as never,
                'trimmed',
                {},
                ['cli'],
            );
            t.ok(
                registry.describe?.().realms.includes('server'),
                'the file beside the suite still counts',
            );
        });
    } finally {
        dispose();
    }
});
