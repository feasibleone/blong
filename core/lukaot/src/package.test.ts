/**
 * The package resolves, and its entry points are the five the exports map declares.
 *
 * A scaffold test rather than a feature test: what it pins is that a consumer's import does not
 * depend on anything the later tasks add, so a broken subpath fails here instead of in `blong-gogo`.
 *
 * It also pins the split the browser depends on: the logger and the store are reachable at `/node` and
 * not at the root, because a static `node:` import in the root costs a page its whole module chain
 * (`@@T-732`).
 */

import {test} from 'tap';

import {PACKAGE_NAME} from '../index.ts';

test('the package entry point resolves', async t => {
    t.equal(PACKAGE_NAME, '@feasibleone/lukaot');
    t.end();
});

test('the node entry builds a logger, and the root does not offer one', async t => {
    // A host that writes records through lukaot (the framework's own log implementation, `@@T-715`)
    // reaches `createLogger` through `/node` — the entry that also carries the store, and the only one
    // whose graph is allowed to open a filesystem.
    const root = (await import('../index.ts')) as Record<string, unknown>;
    t.equal(root.createLogger, undefined, 'the root carries no logger');
    t.equal(root.openCache, undefined, 'the root carries no store');

    const {createLogger, openCache} = await import('../node.ts');
    t.type(createLogger, 'function');
    t.type(openCache, 'function');
    const logger = createLogger({service: 'surface', writer: {write: () => undefined}});
    logger.info('a line');
    logger.child({name: 'child'}).warn('another');
    t.pass('emits through a child');
    t.end();
});

test('the subpaths the exports map declares are importable', async t => {
    for (const subpath of ['../node.ts', '../context.ts', '../service.ts', '../inspect.ts']) {
        const module = await import(subpath);
        t.ok(module, `${subpath} loads`);
    }
    t.end();
});
