/**
 * A browser build must stay free of server-only modules.
 *
 * Several loader specifiers are built at runtime, and rolldown resolves them anyway
 * when it can see through the expression: a single module-level constant in
 * `core/blong-gogo/src/load.ts` was enough for `fastify`, `cacache`, `got`, the whole
 * semantic-log service and the server half of the platform map to be bundled into
 * every browser build. Nothing failed then, because at runtime no browser code path
 * ever asked for those chunks — the output just carried them, and the `@vite-ignore`
 * comments meant to prevent it silenced the only warning that would have said so.
 *
 * This test builds the browser variant of the framework runtime exactly as an app
 * does — same config factory, same `exports` conditions, client build, nothing
 * written to disk — and fails on either of
 *
 *   1. a module from a known server-only area appearing in the graph, or
 *   2. a node builtin that needs externalizing and is not on the list below.
 *
 * Rule 2 is what catches accidents nobody predicted: a new node-only dependency
 * anywhere in the graph shows up as an unfamiliar builtin, and the failure prints the
 * chain that pulled it in. Then either the import is wrong, or the builtin gets added
 * below with the reason it is acceptable.
 *
 * `BLONG_BUNDLE_REPORT=1` prints the full inventory (module count, third-party
 * packages, builtins with their importers) instead of asserting, which is how the
 * list below is kept honest.
 */
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, type Logger, type Plugin} from 'vite';
import {beforeAll, describe, expect, it} from 'vitest';
import {defineBlongViteConfig} from './vite.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(here);

/** Nearest directory holding `rush.json`, so failures can name readable paths. */
const repoRoot = (() => {
    for (let dir = packageRoot; dir !== dirname(dir); dir = dirname(dir)) {
        if (existsSync(join(dir, 'rush.json'))) return dir;
    }
    return dirname(packageRoot);
})();

/**
 * The build entry. A real file is not needed: this id only has to sit in `src/`, so
 * that the bare specifier below resolves — and keeps resolving the way `exports`
 * says a browser build should resolve it — from inside this package.
 */
const virtualEntry = join(here, 'browserBundle.virtual.ts');
const entrySource = ["import load from '@feasibleone/blong-gogo';", 'export default load;'].join(
    '\n',
);

/** Modules that must never be reachable from a browser entry. */
const SERVER_ONLY: Array<[RegExp, string]> = [
    [
        /\/blong-gogo\/src\/(RpcServer|Gateway|ApiGateway|RestFs|SystemDebug|Mcp|tls|swagger|static|template-files)\.ts$/,
        'a blong-gogo module the browser platform never loads',
    ],
    [
        /\/blong-gogo\/src\/(codec\/server|adapter\/server)\.ts$/,
        'the node half of a codec or adapter pair',
    ],
    [/\/semantic-log\/src\/service\//, 'the semantic-log HTTP service'],
    [
        /^fastify$|^@fastify\/|^avvio$|^find-my-way$|^light-my-request$|^fastify-plugin$/,
        'the fastify server stack',
    ],
    [/^cacache$|^@npmcli\/|^ssri$|^fs-minipass$/, 'the on-disk log cache'],
    [/^got$|^http2-wrapper$|^cacheable-request$/, 'a node HTTP client'],
    [
        /^@kubernetes\/|^@octokit\/|^@slack\/|^@modelcontextprotocol\/|^@hono\//,
        'a server integration',
    ],
    [/^chokidar$|^tap$/, 'node-only tooling'],
];

/**
 * The node builtins a browser build is allowed to need, and the only modules allowed
 * to need them. A *pair* that is not listed fails on purpose: that is how an unseen
 * node-only dependency announces itself, even when the builtin it drags in happens to
 * be one of these. Entries go away when their last importer does.
 */
const ALLOWED_BUILTINS: Record<string, {importers: RegExp[]; reason: string}> = {
    assert: {
        importers: [/\/blong-gogo\/src\/Registry\.ts$/, /\/blong-chain\/index\.ts$/],
        reason: 'invariants in the layer registry and in the EIP chain',
    },
    crypto: {
        importers: [/\/ut-function\.cbc\/index\.js$/, /\/blong-mle\/src\/crypto\.ts$/],
        reason: 'the cbc helper and the MLE codec choose an implementation at runtime',
    },
    events: {
        importers: [/\/blong-chain\/index\.ts$/],
        reason: 'the EIP chain is an event emitter',
    },
    path: {
        importers: [/\/@apidevtools\/json-schema-ref-parser\//],
        reason: 'reached through ApiSchema, which validates schemas in the browser',
    },
    test: {
        importers: [/\/blong-gogo\/src\/chain\.ts$/],
        reason: 'the EIP chain wires a runner',
    },
    util: {
        importers: [/\/@apidevtools\/swagger-parser\//, /\/blong-mle\/src\/crypto\.ts$/],
        reason: 'the same two modules as above use it for formatting',
    },
};

interface IInventory {
    /** module id -> static and dynamic import targets */
    modules: Map<string, {imported: string[]; dynamic: string[]}>;
}

const inventoryPlugin = (inventory: IInventory): Plugin => ({
    name: 'blong:bundle-inventory',
    resolveId(source) {
        return source === virtualEntry ? virtualEntry : null;
    },
    load(id) {
        return id === virtualEntry ? entrySource : null;
    },
    moduleParsed(info) {
        inventory.modules.set(info.id, {
            imported: [...info.importedIds],
            dynamic: [...info.dynamicallyImportedIds],
        });
    },
});

const quietLogger: Logger = {
    info() {},
    warn() {},
    warnOnce() {},
    error() {},
    clearScreen() {},
    hasWarned: false,
    hasErrorLogged: () => false,
};

const short = (id: string) => relative(repoRoot, id).replace(/^\.\.\//, '');

/**
 * `__vite-browser-external:node:assert` -> `assert`: a node builtin vite had to
 * replace, because something in the graph imports it.
 */
const builtinOf = (id: string) => /__vite-browser-external:(?:node:)?(.+)$/.exec(id)?.[1];

/** Everyone who imports a module, straight from the graph. */
const importersOf = (inventory: IInventory, target: string) =>
    [...inventory.modules]
        .filter(([, edges]) => edges.imported.includes(target) || edges.dynamic.includes(target))
        .map(([id]) => id);

/** Third-party package of a module id, or the first-party package name. */
const packageOf = (id: string) =>
    id.split('/.pnpm/')[1]?.split('/')[0]?.replace(/\+/g, '/') ??
    /\/blong\/(?:core|realm|suite|demo|test|tools)\/([^/]+)\//.exec(id)?.[1] ??
    id;

/** How the graph reached a module, printed with the failure. */
const chainTo = (inventory: IInventory, target: string) => {
    const from = virtualEntry;
    const parents = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    while (queue.length) {
        const current = queue.shift() as string;
        if (current === target) {
            const path: string[] = [];
            for (let node: string | null = current; node; node = parents.get(node) ?? null) {
                path.unshift(short(node));
            }
            return path.join('\n        -> ');
        }
        const edges = inventory.modules.get(current);
        for (const next of [...(edges?.imported ?? []), ...(edges?.dynamic ?? [])]) {
            if (!parents.has(next)) {
                parents.set(next, current);
                queue.push(next);
            }
        }
    }
    return short(target);
};

const runBundle = async () => {
    const inventory: IInventory = {modules: new Map()};
    await build({
        ...defineBlongViteConfig({
            importMetaUrl: import.meta.url,
            overrides: {
                plugins: [inventoryPlugin(inventory)],
                build: {
                    write: false,
                    // Never let the empty-output-dir pass near the package's own dist.
                    emptyOutDir: false,
                    outDir: join(tmpdir(), 'blong-browser-bundle-smoke'),
                    rollupOptions: {input: virtualEntry},
                },
            },
        }),
        configFile: false,
        root: packageRoot,
        customLogger: quietLogger,
    });
    return inventory;
};

let inventory: IInventory;

beforeAll(async () => {
    inventory = await runBundle();
    if (process.env['BLONG_BUNDLE_REPORT']) {
        const packages = [...new Set([...inventory.modules.keys()].map(packageOf))].sort();
        process.stderr.write(`modules: ${inventory.modules.size}\n`);
        process.stderr.write(`packages:\n  ${packages.join('\n  ')}\n`);
        for (const id of [...inventory.modules.keys()].filter(builtinOf)) {
            const builtin = builtinOf(id) as string;
            const importers = importersOf(inventory, id).map(short).join(', ');
            const allowed = ALLOWED_BUILTINS[builtin]?.reason ?? 'NOT ALLOWED';
            process.stderr.write(`builtin ${builtin} <- ${importers}  [${allowed}]\n`);
        }
    }
}, 300_000);

describe('browser bundle', () => {
    it('reaches the browser variant of the framework runtime', () => {
        const ids = [...inventory.modules.keys()];
        expect(
            ids.some(id => id.endsWith('blong-gogo/src/loadBrowser.ts')),
            'the browser condition did not pick blong-gogo/src/loadBrowser.ts',
        ).toBe(true);
        expect(
            ids.some(id => id.endsWith('blong-gogo/src/loadServer.ts')),
            'the node entry of the framework runtime ended up in a browser build',
        ).toBe(false);
    });

    it('contains no server-only module', () => {
        const offenders = [...inventory.modules.keys()].flatMap(id => {
            const hit = SERVER_ONLY.find(([pattern]) => pattern.test(packageOf(id)));
            return hit ? [`${short(id)} (${hit[1]})\n        -> ${chainTo(inventory, id)}`] : [];
        });
        expect(
            offenders,
            'server-only modules are reachable from a browser entry; see F-203 for how this happens',
        ).toEqual([]);
    });

    it('needs no unexpected node builtin', () => {
        const offenders = [...inventory.modules.keys()]
            .flatMap(id => {
                const builtin = builtinOf(id);
                if (!builtin) return [];
                const allowed = ALLOWED_BUILTINS[builtin];
                return importersOf(inventory, id)
                    .filter(importer => !allowed?.importers.some(pattern => pattern.test(importer)))
                    .map(
                        importer =>
                            `${builtin} <- ${short(importer)}${
                                allowed ? `\n        (only ${allowed.reason} may use it)` : ''
                            }`,
                    );
            })
            .sort();
        expect(
            offenders,
            'a browser build needed node builtins; fix the import, or add the pair to ALLOWED_BUILTINS with a reason',
        ).toEqual([]);
    });
});
