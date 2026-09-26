import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'tap';

// ---------------------------------------------------------------------------
// Node-only modules must not be imported for a value.
//
// A browser build stubs what it cannot resolve and carries on, so an eager import of a
// node-only module survives CI and only shows up in a teardown-free dev server: vite
// links the module graph before any code runs and refuses a *named* import from its
// browser-external stub, which takes the whole page down ("The requested module
// '/@id/__vite-browser-external:node:events' does not provide an export named
// 'EventEmitter'"). The browser entry reaches `Watch.ts` through a dynamic import the
// loader executes at startup, so a static import inside it is as eager as one made by
// the entry itself — this scans the sources rather than a bundle because a dynamic edge
// hides the module from a bundler's static view.
// ---------------------------------------------------------------------------

const srcDir = dirname(fileURLToPath(import.meta.url));

interface INodeOnlyModule {
    /** Import specifier as written in the sources. */
    specifier: string;
    /** What makes it unusable in a browser. */
    reason: string;
}

const NODE_ONLY: INodeOnlyModule[] = [
    {
        specifier: './chain.ts',
        reason: 'it needs node:assert, node:test and the event emitter its executor extends',
    },
];

/** `import x from '...'`, `export {x} from '...'` and side-effect imports, but not `import type`. */
const eagerImport = (specifier: string) =>
    new RegExp(
        `^\\s*(?:import|export)\\s+(?!type\\s)[^;]*?from\\s*['"]${specifier}['"]|^\\s*import\\s*['"]${specifier}['"]`,
        'gm',
    );

test('a node-only module is never imported for a value', async t => {
    const files = readdirSync(srcDir).filter(
        name => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    t.ok(files.length > 0, 'the sources were found');

    for (const {specifier, reason} of NODE_ONLY) {
        const pattern = eagerImport(specifier);
        const offenders = files.flatMap(name =>
            [...readFileSync(join(srcDir, name), 'utf8').matchAll(pattern)].map(
                match => `${name}: ${match[0].trim()}`,
            ),
        );
        t.same(
            offenders,
            [],
            `${specifier} is imported eagerly (${reason}); import it dynamically, or for its types only:\n      ${offenders.join('\n      ')}`,
        );
    }
});
