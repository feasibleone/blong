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

import {type PrimitiveContext, type PrimitiveHost, find} from './engine.ts';
import library from './primitives/library.ts';

/**
 * The `library` primitive: the two shapes an injected library function takes,
 * and the guardrail that makes a plain module in a handler group visible before a
 * suite run logs it.
 */

const host: PrimitiveHost = {
    existsSync,
    readFileSync: (path, options) =>
        readFileSync(path, options as {encoding: BufferEncoding} | undefined),
    writeFileSync: (path, data, options) => {
        mkdirSync(dirname(path), {recursive: true});
        writeFileSync(path, data, options as {encoding: BufferEncoding} | undefined);
    },
    mkdirSync: path => mkdirSync(path, {recursive: true}),
    scan: async (...path: string[]) => readdir(join(...path), {withFileTypes: true}),
    statSync,
    join,
    dirname,
    basename,
    relative,
    resolve,
};

const context = (params: Record<string, unknown> = {}): PrimitiveContext => ({
    subject: 'shop',
    object: 'order',
    kind: 'function',
    platform: 'server',
    params,
});

/** Run a test body in a throwaway realm root. */
const withTemp = async (run: (root: string) => Promise<void> | void): Promise<void> => {
    const root = mkdtempSync(join(tmpdir(), 'kukum-library-'));
    try {
        await run(root);
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
};

const write = (root: string, path: string, content: string): void => {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), {recursive: true});
    writeFileSync(absolute, content);
};

t.test('function kind scaffolds one helper in its own file', t => {
    const [file] = library.files({...context({name: 'formatOrder'}), kind: 'function'});
    t.equal(file.path, 'orchestrator/shop/formatOrder.ts', 'the name is the file name');
    t.match(file.content, /export default library\(/, 'the file is a library()');
    t.match(file.content, /function formatOrder\(/, 'and exports the named function');
    t.end();
});

t.test('bindings kind keeps a whole bundle in one file', t => {
    const [file] = library.files({
        ...context({name: 'orderLib', members: ['orderSplit', 'orderJoin']}),
        kind: 'bindings',
    });
    t.equal(file.path, 'orchestrator/shop/orderLib.ts', 'one file for the bundle');
    t.match(file.content, /function orderSplit\(/, 'first member declared');
    t.match(file.content, /function orderJoin\(/, 'second member declared');
    t.match(file.content, /export type OrderLib = \{/, 'the bundle type is exported');
    t.match(
        file.content,
        /export default library\(\(\): OrderLib => \(\{orderSplit, orderJoin\}\)\)/,
        'one factory returns every member',
    );
    t.end();
});

t.test('bindings kind falls back to a single stub member', t => {
    const [file] = library.files({...context({name: 'orderLib'}), kind: 'bindings'});
    t.match(file.content, /function orderLibHelper\(/, 'a named stub rather than an empty bundle');
    t.end();
});

t.test('guardrails reject names that would not parse', t => {
    t.ok(
        library.check?.({...context({name: 'order-lib'}), kind: 'function'}).length,
        'a kebab-case name is refused',
    );
    t.ok(
        library.check?.({
            ...context({name: 'orderLib', members: ['orderSplit', 'order-join']}),
            kind: 'bindings',
        }).length,
        'a malformed member is refused',
    );
    t.same(
        library.check?.({...context({name: 'orderLib'}), layer: 'browser'}),
        ["layer 'browser' must be one of: orchestrator, adapter, gateway, error, test"],
        'a browser layer is refused',
    );
    t.end();
});

t.test('discover finds the libraries already in the realm', async t => {
    await withTemp(async root => {
        write(root, 'orchestrator/shop/order.ts', 'export default handler(() => ({}));\n');
        write(
            root,
            'orchestrator/shop/orderLib.ts',
            "import {library} from '@feasibleone/blong';\n" +
                'export default library(() => ({orderSplit: (x: unknown) => x}));\n',
        );
        write(root, 'adapter/db/plain.ts', 'export function helper(): void {}\n');
        write(
            root,
            'adapter/db/dbLib.ts',
            "import {library} from '@feasibleone/blong';\n" +
                'export default library(() => ({uuidBuf: (x: unknown) => x}));\n',
        );

        t.same(
            await find(host, library, root),
            ['adapter/db/dbLib.ts', 'orchestrator/shop/orderLib.ts'],
            'only library files, found one level below the layer',
        );
    });
});

t.test('audit reports a plain module in a group folder, and nothing else', async t => {
    await withTemp(async root => {
        write(root, 'orchestrator/shop/order.ts', 'export default handler(() => ({}));\n');
        write(
            root,
            'orchestrator/shop/orderLib.ts',
            "import {library} from '@feasibleone/blong';\n" +
                'export default library(() => ({orderSplit: (x: unknown) => x}));\n',
        );
        write(root, 'orchestrator/shop/helpers.ts', 'export function helper(): void {}\n');
        write(root, 'orchestrator/shop/~.schema.ts', 'export {};\n');
        write(root, 'orchestrator/shop/order.test.ts', 'export function helper(): void {}\n');
        write(root, 'orchestrator/shop/layer.server.ts', 'export default layer({});\n');
        // The group's typed factory is a plain module the loader skips by name.
        write(
            root,
            'orchestrator/shop/handlerGroup.ts',
            'export const handler = handlerGroup<ShopLib>();\n',
        );
        write(root, 'adapter/db/account.ts', 'export function uuidBuf(): void {}\n');
        // A layer-root file is an adapter/orchestrator definition, not a group member.
        write(root, 'adapter/meter.ts', 'export default adapter(() => ({}));\n');

        const messages = (await library.audit?.({host, root})) ?? [];
        t.equal(messages.length, 2, 'exactly the two plain modules are reported');
        t.match(messages[0], /orchestrator\/shop\/helpers\.ts/, 'the orchestrator helper is named');
        t.match(messages[0], /'orchestrator\/shop'/, 'with its group');
        t.match(messages[0], /kukum library add/, 'and the command that fixes it');
        t.match(messages[1], /adapter\/db\/account\.ts/, 'the adapter helper is named');
    });
});

t.test('the catalogue advertises the primitive', t => {
    t.same(library.kinds, ['function', 'bindings'], 'both shapes are advertised');
    t.equal(library.defaultKind, 'function', 'a single helper is the default');
    t.equal(library.skill, 'blong-handler', 'the owning skill is named');
    t.end();
});

t.test('a new bundle is told about the group factory it needs', async t => {
    await withTemp(async root => {
        const ctx = {
            ...context({name: 'orderLib'}),
            kind: 'bindings',
            layer: 'orchestrator',
            group: 'shop',
        };
        const [file] = library.compose?.({host, root, context: ctx}) ?? [];
        t.match(
            (file?.notices ?? []).join(' '),
            /orchestrator\/shop\/handlerGroup\.ts/,
            'the notice names the missing factory and where it goes',
        );

        write(root, 'orchestrator/shop/handlerGroup.ts', 'export const handler = 1;\n');
        const [covered] = library.compose?.({host, root, context: ctx}) ?? [];
        t.same(covered?.notices ?? [], [], 'no notice once the group has one');
    });
});
