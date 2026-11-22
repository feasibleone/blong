/**
 * Unit tests for the API-schema generator in ApiSchema.ts.
 *
 * The generator is a side effect on the source tree, so what is pinned is exactly that: a stub appears
 * where a loaded API method has no file, it appears **once** — a second pass must not write over what
 * the developer put in the file — and the folder scan that feeds it reports nothing, because a scan
 * that generates nothing is the common case and announced itself on every reload (`@@D-961`).
 */

import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {test} from 'tap';

import ApiSchema from './ApiSchema.ts';

/** One API document whose namespace matches the realm folder, so its method belongs in that group. */
const bundle = {
    openapi: '3.0.0',
    info: {title: 'demo', version: '1.0.0'},
    'x-blong': {namespace: 'realm'},
    paths: {
        '/ping': {
            get: {
                operationId: 'clockPing',
                responses: {
                    '200': {
                        description: 'pong',
                        content: {
                            'application/json': {
                                schema: {type: 'object', properties: {ok: {type: 'boolean'}}},
                            },
                        },
                    },
                },
            },
        },
    },
};

function harness(generate = true) {
    const reported: string[] = [];
    const root = mkdtempSync(join(tmpdir(), 'blong-api-schema-'));
    const dir = join(root, 'realm', 'orchestrator', 'clock');
    mkdirSync(dir, {recursive: true});
    const log = {
        // `Internal.merge` builds the component's logger face from the config's `logLevel`.
        logger: () => ({}),
        signalFor: () => ({
            frameworkSchemaDirScanning: () => reported.push('scan'),
            frameworkSchemaFileRewritten: () => reported.push('write'),
            frameworkSchemaMethodUnplaced: () => reported.push('unplaced'),
        }),
    };
    const platform = {
        dirname,
        join,
        basename,
        extname,
        resolve,
        readFileSync,
        writeFileSync,
        statSync,
        scan: async () => [],
    };
    const apiSchema = new ApiSchema({generate}, {log, platform} as never);
    return {
        apiSchema,
        dir,
        root,
        reported,
        // `loadApi` takes an inline document, but `schema()`'s declared namespace type still says
        // `string | string[]` — the cast is that gap, not a shortcut in the test.
        settings: {
            namespace: {realm: [bundle]} as unknown as Record<string, string[]>,
            source: root,
        },
    };
}

test('a loaded API method with no file gets a stub, and the folder scan stays quiet', async t => {
    const {apiSchema, dir, root, reported, settings} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.equal(await apiSchema.generateDir(dir, []), true, 'the folder is one a handler can go in');
    await apiSchema.schema({namespace: settings.namespace}, settings.source);

    const file = join(dir, 'realmclockPing.ts');
    const stub = readFileSync(file, 'utf-8');
    t.match(stub, /async function realmclockPing/, 'the stub names the operation');
    t.match(
        stub,
        /import unchanged from '@feasibleone\/blong'/,
        'and carries the generated marker',
    );
    t.same(reported, ['write'], 'only the write is reported — the scan is silent');
});

test('a pass writes nothing when the file already says what it would write', async t => {
    // A write bumps the file's mtime, and a watching runner restarts on that: rewriting an identical
    // stub is an endless restart loop rather than a no-op (`@@F-817`).
    const {apiSchema, dir, root, reported, settings} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    const file = join(dir, 'realmclockPing.ts');

    await apiSchema.generateDir(dir, []);
    await apiSchema.schema({namespace: settings.namespace}, settings.source);
    const written = statSync(file).mtimeMs;
    reported.length = 0;

    // A second pass: the folder is scanned again and the definition resolved again, as a reload does.
    await apiSchema.generateDir(dir, readdirSync(dir, {withFileTypes: true}) as never);
    await apiSchema.schema({namespace: settings.namespace}, settings.source);

    t.same(reported, [], 'nothing was written, so nothing was reported');
    t.equal(statSync(file).mtimeMs, written, 'and the file on disk was left untouched');
});

test('a stub is rewritten only while it still carries the marker', async t => {
    // The stub is the generator's until somebody writes in it, and the marker is what says so. A
    // document that changed under a stub is followed; a file whose marker is gone is not touched
    // (`@@D-965`).
    const {apiSchema, dir, root, reported, settings} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    const file = join(dir, 'realmclockPing.ts');

    await apiSchema.generateDir(dir, []);
    await apiSchema.schema({namespace: settings.namespace}, settings.source);

    // The document grew a parameter; the stub still carries the marker, so it follows.
    await apiSchema.generateDir(dir, readdirSync(dir, {withFileTypes: true}) as never);
    await apiSchema.schema({namespace: {realm: [grownBundle()]}, source: root} as never, root);
    t.match(
        readFileSync(file, 'utf-8'),
        /verbose\?: boolean;/,
        'a stub whose marker is still there follows the definition',
    );
    t.same(reported.filter(entry => entry === 'write').length, 2, 'and the rewrite was reported');
});

/** The same operation with one query parameter added — a document that moved under a stub. */
function grownBundle() {
    return {
        ...bundle,
        paths: {
            '/ping': {
                get: {
                    ...bundle.paths['/ping'].get,
                    parameters: [{in: 'query', name: 'verbose', schema: {type: 'boolean'}}],
                },
            },
        },
    };
}

test('a file the developer has started on is left alone', async t => {
    const {apiSchema, dir, root, reported, settings} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    const file = join(dir, 'realmclockPing.ts');
    const mine = '// the handler the API asked for, written by hand\n';
    writeFileSync(file, mine, 'utf-8');

    await apiSchema.generateDir(dir, readdirSync(dir, {withFileTypes: true}) as never);
    await apiSchema.schema({namespace: settings.namespace}, settings.source);

    t.equal(readFileSync(file, 'utf-8'), mine, 'no marker, no rewrite');
    t.same(reported, [], 'and nothing was reported, because nothing was written');
});

test('an empty file is claimed so the definition can fill it', async t => {
    const {apiSchema, dir, root, settings} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    const file = join(dir, 'realmclockPing.ts');
    writeFileSync(file, '', 'utf-8');

    t.equal(await apiSchema.generateFile(file), true, 'an empty handler file is claimed');
    await apiSchema.generateDir(dir, []);
    await apiSchema.schema({namespace: settings.namespace}, settings.source);

    t.match(readFileSync(file, 'utf-8'), /async function realmclockPing/, 'and then filled');
});

test('a file with content is never claimed', async t => {
    const {apiSchema, dir, root} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));
    const file = join(dir, 'realmclockPing.ts');
    writeFileSync(file, 'export default 1;\n', 'utf-8');

    t.equal(
        await apiSchema.generateFile(file),
        false,
        'the developer’s file is left to the loader',
    );
});

test('a folder outside an orchestrator layer is not a generation target', async t => {
    const {apiSchema, root} = harness();
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.equal(
        await apiSchema.generateDir(join(root, 'realm', 'adapter', 'db'), []),
        false,
        'an adapter folder is not scanned for handlers to generate',
    );
});

test('generation is off unless an intent turned it on', async t => {
    // What the synthetic config does: `generate: false` everywhere, `true` under `dev`. A serving or
    // manifest-writing process must not edit the source tree it was started from (`@@D-961`).
    const {apiSchema, dir, root, settings} = harness(false);
    t.teardown(() => rmSync(root, {recursive: true, force: true}));

    t.equal(await apiSchema.generateDir(dir, []), false, 'the folder scan is not even recorded');
    await apiSchema.generateFile(join(dir, 'realmclockPing.ts'));
    writeFileSync(join(dir, 'realmclockPing.ts'), '', 'utf-8');
    await apiSchema.generateFile(join(dir, 'realmclockPing.ts'));
    await apiSchema.schema({namespace: settings.namespace}, settings.source);

    t.equal(readFileSync(join(dir, 'realmclockPing.ts'), 'utf-8'), '', 'nothing was written');
});
