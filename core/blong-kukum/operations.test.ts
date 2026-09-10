import type {IRegistry} from '@feasibleone/blong/types';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, relative, resolve} from 'node:path';
import t from 'tap';

import {type Predicate, type PrimitiveHost} from './engine.ts';
import {type DiagnosticReport, type OperationParams, type OperationResult} from './operation.ts';
import activationFind from './orchestrator/kukum/activationFind.ts';
import addOperation from './orchestrator/kukum/add.ts';
import checkOperation from './orchestrator/kukum/check.ts';
import editOperation from './orchestrator/kukum/edit.ts';
import findOperation from './orchestrator/kukum/find.ts';
import getOperation from './orchestrator/kukum/get.ts';
import instructionFind from './orchestrator/kukum/instructionFind.ts';
import methodFind from './orchestrator/kukum/methodFind.ts';
import sourceCheck from './orchestrator/kukum/sourceCheck.ts';
import treeFind from './orchestrator/kukum/treeFind.ts';

/**
 * Unit coverage for the operation layer — the shaping behind the meta endpoints
 * and the overwrite reporting on `add`. The end-to-end path (real gateway, real
 * scaffolded realm) is covered by `index.test.ts` and `scaffold.test.ts`.
 */

/**
 * Drive the operations the way the runtime does.
 *
 * Every endpoint is a `library()` function that reads the platform and the live
 * registry off `this`; the factory is built once and the result called with the
 * `this` the framework seeds. These wrappers keep the assertions about
 * behaviour — `libraries.test.ts` covers the binding mechanics directly.
 */
const build = <T>(mod: unknown): T => (mod as (api: object) => T)({config: {}});

const BINDINGS: Record<string, unknown> = {
    add: addOperation,
    edit: editOperation,
    find: findOperation,
    get: getOperation,
    check: checkOperation,
};

const operate = (
    platform: PrimitiveHost,
    id: string,
    predicate: Predicate,
    params: OperationParams,
) => {
    const binding = BINDINGS[predicate];
    if (!binding) throw new Error(`Unsupported predicate '${predicate}'`);
    return build<(this: object, id: string, params: OperationParams) => Promise<OperationResult>>(
        binding,
    ).call({platform}, id, params);
};

type RegistryView = {
    available: boolean;
    groups?: Array<{name: string; handlerCount: number}>;
    folders?: unknown[];
    files?: Array<{file: string; realm: string}>;
};

const methods = (registry?: IRegistry) =>
    build<(this: object) => RegistryView>(methodFind).call({registry});

type TreeView = {
    available: boolean;
    realms?: Array<{realm: string; groups: string[]; files: string[]}>;
    ports?: string[];
    layerFiles?: unknown[];
    groups?: unknown[];
};

const tree = (registry?: IRegistry) => build<(this: object) => TreeView>(treeFind).call({registry});

const activationTable = () =>
    build<() => Record<string, {server?: object; browser?: object}>>(activationFind).call({});

const instructions = (platform: PrimitiveHost, params: OperationParams) =>
    build<
        (
            this: object,
            params: OperationParams,
        ) => Promise<{target: string; files: Array<{path: string; instructions: string[]}>}>
    >(instructionFind).call({platform}, params);

const checkSource = (platform: PrimitiveHost, params: OperationParams) =>
    build<
        (
            this: object,
            params: OperationParams,
        ) => Promise<{target: string; files: string[]; diagnostics?: DiagnosticReport}>
    >(sourceCheck).call({platform}, params);

const host: PrimitiveHost = {
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync: path => mkdirSync(path, {recursive: true}),
    scan: async (...path: string[]) => readdir(join(...path), {withFileTypes: true}),
    statSync,
    join,
    dirname,
    basename,
    relative,
    resolve,
};

withTemp('operations', temp => {
    t.test('methods / tree reflect the registry description', t => {
        t.same(methods(undefined), {available: false}, 'no registry → unavailable');

        const registry = {
            describe: () => ({
                realms: ['shop', 'stock'],
                ports: ['shop.dispatch'],
                groups: [{name: 'shop.order', handlerCount: 3}],
                folders: [{group: 'shop.order', realm: 'shop', dir: 'orchestrator/order'}],
                files: [{file: 'orchestrator/order/shopOrderAdd.ts', realm: 'shop'}],
                layerFiles: [{file: 'orchestrator/layer.server.ts', realm: 'shop'}],
            }),
        } as unknown as IRegistry;

        const methodView = methods(registry);
        t.equal(methodView.available, true, 'marker set');
        t.same(
            methodView.groups,
            [{name: 'shop.order', handlerCount: 3}],
            'groups are passed through',
        );
        t.equal(methodView.files?.length, 1, 'files are passed through');

        const treeView = tree(registry);
        t.equal(treeView.available, true, 'marker set');
        t.same(
            treeView.realms?.find(realm => realm.realm === 'shop'),
            {
                realm: 'shop',
                groups: ['shop.order'],
                files: ['orchestrator/order/shopOrderAdd.ts'],
            },
            'realm is joined with its groups and files',
        );
        t.same(
            treeView.realms?.find(realm => realm.realm === 'stock'),
            {realm: 'stock', groups: [], files: []},
            'a realm with nothing on disk still appears',
        );
        t.same(treeView.ports, ['shop.dispatch'], 'ports reported');
        t.end();
    });

    t.test('activation table comes from the shared source of truth', t => {
        const table = activationTable();
        t.ok(table['orchestrator']?.server, 'orchestrator layer is listed');
        t.ok(table['meta']?.browser, 'meta layer is listed for the browser too');
        t.end();
    });

    t.test('instruction.find walks the tree and reads the tags back', async t => {
        mkdirSync(join(temp, 'orchestrator', 'shop'), {recursive: true});
        mkdirSync(join(temp, 'node_modules', 'skipme'), {recursive: true});
        writeFileSync(
            join(temp, 'orchestrator', 'shop', 'shopOrderAdd.ts'),
            "import unchanged from '@feasibleone/blong';\n" +
                '// @kukum-instructions: make this idempotent\n' +
                '// @kukum-instructions: add retries\n' +
                'export default {};\n',
        );
        writeFileSync(
            join(temp, 'node_modules', 'skipme', 'ignored.ts'),
            '// @kukum-instructions: should never be found\n',
        );

        const result = await instructions(host, {target: temp});
        t.equal(result.files.length, 1, 'only the realm file is reported');
        t.equal(result.files[0].path, 'orchestrator/shop/shopOrderAdd.ts', 'path is relative');
        t.same(
            result.files[0].instructions,
            ['make this idempotent', 'add retries'],
            'both instruction lines are read in order',
        );
        t.end();
    });
});

// Its own directory: the instruction test above creates a node_modules, which
// would make diagnostics run instead of being skipped.
withTemp('check', temp => {
    t.test('source.check reports honestly when dependencies are absent', async t => {
        const result = await checkSource(host, {target: temp, files: ['whatever.ts']});
        t.equal(
            result.diagnostics?.skipped,
            'node_modules is not installed in the target package',
            'skipped rather than reporting unresolved-import noise',
        );
        t.equal(result.diagnostics?.errors, 0, 'no phantom errors');
        t.end();
    });
});

withTemp('warnings', temp => {
    t.test('a second table lands beside the shared schema file', async t => {
        const create = await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'order',
            kind: 'table',
        });
        t.same(create.warnings, [], 'first write is a create, so nothing is at risk');
        t.ok(existsSync(join(temp, 'meta/type/schema.ts')), 'schema file written');

        const second = await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'invoice',
            kind: 'table',
        });
        t.same(second.warnings, [], 'composing is not destructive, so it does not warn');
        t.ok(existsSync(join(temp, 'meta/type/invoice.ts')), 'the new table gets its own file');
        t.match(
            readFileSync(join(temp, 'meta/type/schema.ts'), 'utf8'),
            /\border: type\.Object/,
            'the table already declared in the shared file survives',
        );
        t.equal(
            second.files.find(f => f.path === 'meta/type/schema.ts'),
            undefined,
            'untouched',
        );
        t.end();
    });

    t.test('replace mode regenerates from scratch and warns about the cost', async t => {
        await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'order',
            kind: 'table',
        });
        const replaced = await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'invoice',
            kind: 'table',
            mode: 'replace',
            dryRun: true,
        });
        t.same(
            replaced.files.map(file => file.path),
            ['meta/type/schema.ts'],
            'replace regenerates the shared file instead of a sibling',
        );
        t.match(
            String(replaced.warnings?.[0]),
            /would replace meta\/type\/schema\.ts/,
            'and says what it will cost',
        );
        t.match(
            String(replaced.warnings?.[0]),
            /holds every entity in the realm/,
            'and why it matters',
        );
        t.end();
    });

    t.test('register splices into the existing tables map', async t => {
        await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'order',
            kind: 'register',
        });
        const second = await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'invoice',
            kind: 'register',
        });
        t.same(second.warnings, [], 'the registry is composed, not replaced');
        const db = readFileSync(join(temp, 'meta/db/db.ts'), 'utf8');
        t.match(db, /'shop\.order': 2/, 'the earlier entry survives');
        t.match(db, /'shop\.invoice': 2/, 'the new entry was added');
        t.end();
    });

    t.test('a generated test group is registered with its platform', async t => {
        writeFileSync(
            join(temp, 'index.ts'),
            "import unchanged from '@feasibleone/blong';\n" +
                'export default {integration: {watch: {test: []}}};\n',
        );
        const result = await operate(host, 'test', 'add', {
            target: temp,
            subject: 'e2e',
            object: 'widget',
            kind: 'server',
        });
        t.ok(result.written.includes('server/test/test/testWidget.ts'), 'group file written');
        t.ok(result.written.includes('index.ts'), 'bootstrap updated');
        t.match(
            readFileSync(join(temp, 'index.ts'), 'utf8'),
            /test: \['test\.widget'\]/,
            'the group is listed, so it will actually run',
        );
        t.same(result.messages, [], 'nothing was left for the caller to wire by hand');
        t.end();
    });

    t.test('an unregisterable group is reported, not silently skipped', async t => {
        const result = await operate(host, 'test', 'add', {
            target: temp,
            subject: 'e2e',
            object: 'gadget',
            kind: 'browser',
        });
        t.ok(
            result.written.includes('browser/test/test/testGadget.flow.ts'),
            'the group file is still written',
        );
        t.match(
            String(result.messages?.[0]),
            /could not register the 'test\.gadget\.flow' test group/,
            'the caller is told the group would never run',
        );
        t.end();
    });

    t.test('a second entity appends a describe block to the spec', async t => {
        const first = await operate(host, 'test', 'add', {
            target: temp,
            subject: 'e2e',
            object: 'widget',
            kind: 'playwright',
        });
        t.ok(first.written.includes('test/e2e.play.ts'), 'spec written');

        await operate(host, 'test', 'add', {
            target: temp,
            subject: 'e2e',
            object: 'gadget',
            kind: 'playwright',
        });
        const spec = readFileSync(join(temp, 'test/e2e.play.ts'), 'utf8');
        t.match(spec, /test\.describe\('Widget'/, 'the first entity is still described');
        t.match(spec, /test\.describe\('Gadget'/, 'the second entity was appended');
        t.end();
    });

    t.test('re-adding the same entity changes nothing', async t => {
        const again = await operate(host, 'test', 'add', {
            target: temp,
            subject: 'e2e',
            object: 'gadget',
            kind: 'playwright',
        });
        t.same(again.written, [], 'idempotent: no describe block is duplicated');
        t.end();
    });

    t.test('a hand-written file is refused, not silently replaced', async t => {
        const path = join(temp, 'meta/type/schema.ts');
        writeFileSync(path, '// hand written\n');
        const result = await operate(host, 'schema', 'add', {
            target: temp,
            subject: 'shop',
            object: 'order',
            kind: 'table',
        });
        t.same(result.written, [], 'nothing written');
        t.same(result.skipped, ['meta/type/schema.ts'], 'skip reported');
        t.same(readFileSync(path, 'utf8'), '// hand written\n', 'content preserved');
        t.match(
            String(result.warnings?.[0]),
            /left alone: it is hand-written/,
            'the warning explains the skip',
        );
        t.end();
    });
});

/** Run a test group in a throwaway directory, cleaned up afterwards. */
function withTemp(name: string, body: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), `kukum-${name}-`));
    t.teardown(() => rmSync(dir, {recursive: true, force: true}));
    body(dir);
}
