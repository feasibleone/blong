import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import type {PrimitiveHost} from './engine.ts';
import {type OperationParams, type OperationResult} from './operation.ts';
import addOperation from './orchestrator/kukum/add.ts';

/**
 * Call an operation the way the runtime does: build the `library()` factory,
 * then call the result with the `this` the framework seeds.
 *
 * The fixture is built entirely with `add`, so that is the only predicate wired
 * in here.
 */
const build = <T>(mod: unknown): T => (mod as (api: object) => T)({config: {}});

const operate = (
    platform: PrimitiveHost,
    id: string,
    predicate: string,
    params: OperationParams,
): Promise<OperationResult> => {
    if (predicate !== 'add') throw new Error(`operation '${predicate}' is not wired in here`);
    return build<(this: object, id: string, params: OperationParams) => Promise<OperationResult>>(
        addOperation,
    ).call({platform}, id, params);
};

/**
 * The end-to-end fixture, described once.
 *
 * Both `e2e.test.ts` (which asserts the committed fixture is exactly this) and
 * `bin/fixture.ts` (which regenerates it and refreshes the screenshot
 * baselines) read their definition from here, so the two can never disagree
 * about what the fixture is supposed to contain.
 */

export const HERE = fileURLToPath(new URL('.', import.meta.url));

/**
 * The committed fixture realm.
 *
 * It sits under a `fixture/` folder on purpose: tap excludes folders with that
 * name by default, so the realm's own `index.test.ts` is driven by
 * `e2e.test.ts` (which controls when it runs) rather than picked up as another
 * test file of this package.
 */
export const FIXTURE = join(HERE, 'test', 'fixture', 'e2e-realm');

export const SUBJECT = 'e2e';

/**
 * The entity the `blong-kopi` template already scaffolds. It is left alone so
 * the fixture keeps one entity that is purely template output — the working
 * baseline — while the additions below are exercised on top of it.
 */
export const TEMPLATE_OBJECT = 'widget';

/** The entity added through the API, on top of the scaffolded realm. */
export const ADDED_OBJECT = 'gadget';

/**
 * The primitives added for the second entity.
 *
 * Deliberately limited to what the realm's three test legs can actually cover:
 * a table, its registry entry, a test seed (which also grants the entity's
 * actions in the RBAC seed), a model spec, and one test per platform. Adding
 * `adapter`, `storybook` or `component` here would produce artifacts no test in
 * this realm could exercise, which would quietly make the coverage assertion
 * vacuous.
 */
export const ADDED: Array<{primitive: string; kind: string}> = [
    {primitive: 'schema', kind: 'table'},
    {primitive: 'schema', kind: 'register'},
    {primitive: 'seed', kind: 'test'},
    {primitive: 'model', kind: 'model'},
    {primitive: 'test', kind: 'server'},
    {primitive: 'test', kind: 'browser'},
    {primitive: 'test', kind: 'playwright'},
];

/**
 * Scaffold the whole fixture into `target`: the template realm, then every
 * added primitive. Returns each operation's result so a caller can inspect
 * files, skipped paths and notices.
 */
export async function scaffoldFixture(
    host: PrimitiveHost,
    target: string,
): Promise<OperationResult[]> {
    const results: OperationResult[] = [
        await operate(host, 'realm', 'add', {
            target,
            subject: SUBJECT,
            object: TEMPLATE_OBJECT,
        }),
    ];
    for (const step of ADDED) {
        results.push(
            await operate(host, step.primitive, 'add', {
                target,
                subject: SUBJECT,
                object: ADDED_OBJECT,
                kind: step.kind,
            }),
        );
    }
    return results;
}

/**
 * Regenerate the fixture in place.
 *
 * The generated files are gitignored, so this runs on every `e2e.test.ts`
 * invocation and the fixture must be rebuilt from scratch each time. The
 * Playwright baselines are the exception: they *are* committed (they pin the
 * generated UI), and deleting the tree would take them with it, so they are
 * carried across unless a baseline refresh was explicitly asked for.
 */
export async function regenerateFixture(
    host: PrimitiveHost,
    options: {keepBaselines?: boolean} = {},
): Promise<OperationResult[]> {
    const {keepBaselines = true} = options;
    const snapshots = join(FIXTURE, `test/${SUBJECT}.play.ts-snapshots`);
    const preserved =
        keepBaselines && existsSync(snapshots)
            ? readdirSync(snapshots).map(
                  name => [name, readFileSync(join(snapshots, name))] as const,
              )
            : [];

    rmSync(FIXTURE, {recursive: true, force: true});
    mkdirSync(FIXTURE, {recursive: true});

    const results = await scaffoldFixture(host, FIXTURE);

    if (preserved.length) {
        mkdirSync(snapshots, {recursive: true});
        for (const [name, content] of preserved) writeFileSync(join(snapshots, name), content);
    }
    return results;
}
