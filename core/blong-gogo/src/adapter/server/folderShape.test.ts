import {existsSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {kind} from '@feasibleone/blong/types';
import {test} from 'tap';

/**
 * The shape of `adapter/server/`, pinned.
 *
 * The folder is a **list of adapter instances** and the handler groups they serve — nothing else.
 * The loader scans it, so every module here is paid for by every process that carries the `adapter`
 * realm, which is all of them, and a module that is not an instance is registered by none: the
 * engine implementations that used to live here made a process that names no `deepseek` account
 * evaluate the harness launcher, and the loader quietly dropped them because a child needs a
 * default export.
 *
 * Implementations therefore live elsewhere — `src/agent/` for the engine kinds, `src/adapter/impl/`
 * for the modules an adapter imports — in folders nothing scans, so an implementation is evaluated
 * only by the code that imports it.
 *
 * A handler group is a folder, and every file in one must have a default export: the loader reports
 * `probably a generic source code was put in a handler group folder` and skips it otherwise, which
 * reads as a missing method rather than as a mis-filing.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

/** The realm definition itself, read as a value so the declaration can be asserted. */
import realmDefinition from '../server.ts';

const isCode = (name: string): boolean => /\.ts$/.test(name);
const isTest = (name: string): boolean => /\.test\.ts$/.test(name);

const load = async (folder: string, name: string): Promise<{default?: unknown}> =>
    (await import(pathToFileURL(join(folder, name)).href)) as {default?: unknown};

test('the adapter realm ships its bases as prototypes, not as children', async t => {
    // A `children` entry is imported with the realm: every base cost every process, whether or not
    // anything extended it. `thunk` scans the same folder and imports an entry only when an instance
    // names it, which is the difference between a framework that pays for its own catalogue and one
    // that pays for what a deployment uses (`@@T-593`).
    const definition = (
        realmDefinition as unknown as (blong: unknown) => {children?: unknown; thunk?: string[]}
    )({type: {Object: () => ({}), Boolean: () => ({})}});

    t.same(definition.thunk, ['./server'], 'the folder is declared as prototypes');
    t.equal(definition.children, undefined, 'and not as children, which are imported whole');
});

test('every top-level module in adapter/server is an adapter instance', async t => {
    const files = readdirSync(HERE, {withFileTypes: true})
        .filter(entry => entry.isFile() && isCode(entry.name) && !isTest(entry.name))
        .map(entry => entry.name)
        .sort();

    t.ok(files.length > 10, 'the folder is where the adapter instances live');

    for (const name of files) {
        const loaded = await load(HERE, name);
        t.equal(
            kind(loaded.default as never),
            'adapter',
            `${name} is an adapter instance — anything else here is imported by every process and ` +
                'registered by none',
        );
    }
});

test('every handler group under adapter/server is a folder of handlers', async t => {
    const groups = readdirSync(HERE, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();

    t.ok(groups.length > 0, 'the ports keep their handler groups beside them');
    for (const group of groups) {
        // The folder is named after the base that serves it, so a reader looking for the methods of
        // `slack` finds them in `slack/`, and a lazy manifest can be built from the names alone —
        // `slackIn/` beside `slack/` was two halves of one adapter with nothing saying so.
        t.ok(
            existsSync(join(HERE, `${group}.ts`)),
            `${group}/ is served by ${group}.ts — a group folder named after something else hides ` +
                'which base its handlers belong to',
        );
    }

    for (const group of groups) {
        const folder = join(HERE, group);
        const files = readdirSync(folder)
            .filter(name => isCode(name) && !isTest(name))
            .sort();
        for (const name of files) {
            const loaded = await load(folder, name);
            t.ok(
                loaded.default,
                `${group}/${name} has a default export — a plain module in a group folder is ` +
                    'reported as a mis-filing and its method is never registered',
            );
        }
    }
});
