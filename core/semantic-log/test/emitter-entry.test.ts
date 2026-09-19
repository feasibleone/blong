import {readFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import t from 'tap';

/**
 * The emitter's independence, asserted rather than assumed.
 *
 * `emitter.ts` exists so a runtime can depend on the records without acquiring
 * the cluster service's server dependency. That is a property of the *import
 * graph*, which nothing else in this suite observes: the strip-types sweep loads
 * every module and the parity audit reads the manifest, and neither of them
 * would notice `fastify` being pulled into the emitter's half by one added
 * import.
 *
 * The walk is textual — relative `.ts` imports only — which is exactly the shape
 * the guard needs to be exact about: a bare specifier is either a Node builtin
 * (harmless) or a package, and the only package that must stay out of the
 * emitter's half is `fastify`. The second test walks the service entry and
 * asserts it *does* reach `fastify`, so the first cannot pass by walking
 * nothing.
 */

const pkgDir = fileURLToPath(new URL('..', import.meta.url));

/** A relative module an already-loaded file imports: `from './x.ts'` and `import('./x.ts')`. */
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*'(\.[^']+\.ts)'/g;

/** The relative `.ts` modules one package file imports, resolved against the package root. */
function relativeImportsOf(file: string): string[] {
    const source = readFileSync(join(pkgDir, file), 'utf8');
    const found: string[] = [];
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
        const target = match[1];
        if (target !== undefined) {
            found.push(relative(pkgDir, join(dirname(join(pkgDir, file)), target)));
        }
    }
    return found;
}

/** The transitive closure of a package file's relative imports, the file included. */
function graphFrom(entry: string): Set<string> {
    const seen = new Set<string>();
    const pending = [entry];
    while (pending.length > 0) {
        const file = pending.pop();
        if (file === undefined || seen.has(file)) {
            continue;
        }
        seen.add(file);
        for (const next of relativeImportsOf(file)) {
            if (!seen.has(next)) {
                pending.push(next);
            }
        }
    }
    return seen;
}

/** The modules of a graph that import `fastify` directly. */
function fastifyImporters(graph: Set<string>): string[] {
    return [...graph].filter(file => /from\s+'fastify'/.test(readFileSync(join(pkgDir, file), 'utf8')));
}

t.test('the emitter entry reaches no server dependency', t => {
    const graph = graphFrom('emitter.ts');
    // The walk has to have walked: a regex change that matched nothing would
    // otherwise make the assertion below true for the wrong reason.
    t.ok(graph.size >= 15, `the walk reached the emitter's modules (${graph.size})`);
    t.ok(graph.has('src/cache.ts'), 'the store the emitter retains through is in the walk');
    t.notOk(graph.has('index.ts'), 'the emitter does not pull the package root in with it');
    t.notOk(graph.has('src/service/app.ts'), 'the service is not in the emitter half');
    t.same(fastifyImporters(graph), [], 'no module reachable from the emitter imports fastify');
    t.end();
});

t.test('the service entry does reach fastify, so the walk above is not vacuous', t => {
    const graph = graphFrom('service.ts');
    t.ok(graph.size >= 15, `the walk reached the service's modules (${graph.size})`);
    t.ok(fastifyImporters(graph).length > 0, 'fastify is reachable from the service entry');
    t.end();
});
