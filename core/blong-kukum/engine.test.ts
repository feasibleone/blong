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

import {
    type PrimitiveContext,
    type PrimitiveHost,
    apply,
    applyInstructions,
    assertInside,
    extractInstructions,
    isGenerated,
    isInside,
    plan,
    tripleName,
    withMarker,
} from './engine.ts';
import {methodName} from './operation.ts';
import {PRIMITIVES, getPrimitive} from './primitives/index.ts';

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

const context: PrimitiveContext = {
    subject: 'test',
    object: 'item',
    kind: 'api',
    platform: 'server',
    params: {predicate: 'add'},
};

t.test('tripleName builds subjectObjectPredicate', t => {
    t.equal(tripleName('test', 'item', 'add'), 'testItemAdd');
    t.equal(methodName('handler', 'add'), 'kukumHandlerAdd');
    t.end();
});

t.test('generated marker and instructions', t => {
    const marked = withMarker('export const x = 1;\n');
    t.ok(isGenerated(marked), 'marker is detected');
    t.ok(marked.startsWith('import unchanged from'), 'marker stays on the first line');

    const withInstruction = applyInstructions(marked, [
        'prefer a single responsibility',
        'line two',
    ]);
    t.same(extractInstructions(withInstruction), ['prefer a single responsibility', 'line two']);
    t.ok(
        withInstruction.startsWith('import unchanged from'),
        'instructions never displace the marker',
    );
    t.notOk(
        applyInstructions(withInstruction, []).includes('@kukum-instructions'),
        'instructions can be cleared',
    );
    t.end();
});

t.test('path safety', t => {
    const root = '/tmp/kukum-root';
    t.ok(isInside(host, root, join(root, 'error', 'error.ts')), 'inside root');
    t.notOk(isInside(host, root, '/etc/passwd'), 'outside root');
    t.notOk(isInside(host, root, join(root, '..', 'escape.ts')), 'parent traversal rejected');
    t.throws(() => assertInside(host, root, '/etc/passwd'), 'assertInside throws');
    t.end();
});

t.test('plan/apply is idempotent and protects hand-written files', t => {
    const root = mkdtempSync(join(tmpdir(), 'kukum-'));
    try {
        const handler = getPrimitive('handler');
        t.ok(handler, 'handler primitive exists');
        if (!handler) return t.end();

        const changes = plan(host, handler, {root, context, instructions: ['do a thing']});
        t.equal(changes.length, 1, 'one file planned');
        t.equal(changes[0].path, 'orchestrator/test/testItemAdd.ts');
        t.equal(changes[0].action, 'create');

        const first = apply(host, changes);
        t.same(first.written, ['orchestrator/test/testItemAdd.ts'], 'file written');
        t.ok(
            readFileSync(join(root, 'orchestrator/test/testItemAdd.ts'), 'utf8').includes(
                '@kukum-instructions',
            ),
            'instructions embedded',
        );

        const second = plan(host, handler, {root, context, instructions: ['do a thing']});
        t.equal(second[0].action, 'unchanged', 're-plan is a no-op');
        t.same(apply(host, second).written, [], 'nothing rewritten');

        // A hand-written file (marker removed) is never silently clobbered.
        writeFileSync(join(root, 'orchestrator/test/testItemAdd.ts'), 'hand written\n');
        const third = plan(host, handler, {root, context, instructions: []});
        t.ok(third[0].handWritten, 'hand-written file detected');
        const guarded = apply(host, third);
        t.same(guarded.written, [], 'hand-written file skipped');
        t.same(guarded.skipped, ['orchestrator/test/testItemAdd.ts'], 'skip reported');
        t.equal(
            readFileSync(join(root, 'orchestrator/test/testItemAdd.ts'), 'utf8'),
            'hand written\n',
            'content preserved',
        );
        t.same(apply(host, third, {force: true}).written, ['orchestrator/test/testItemAdd.ts']);
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});

t.test('catalogue is well formed', t => {
    t.ok(PRIMITIVES.length >= 10, 'at least 10 primitives');
    const ids = new Set<string>();
    const methods = new Set<string>();
    for (const primitive of PRIMITIVES) {
        t.notOk(ids.has(primitive.id), `primitive id '${primitive.id}' is unique`);
        ids.add(primitive.id);
        t.ok(primitive.kinds.length > 0, `${primitive.id} declares kinds`);
        t.ok(
            primitive.kinds.includes(primitive.defaultKind),
            `${primitive.id} default kind is one of its kinds`,
        );
        t.ok(primitive.skill.length > 0, `${primitive.id} names its owning skill`);
        for (const predicate of ['find', 'get', 'add', 'edit', 'check'] as const) {
            const method = methodName(primitive.id, predicate);
            t.notOk(methods.has(method), `method '${method}' is unique`);
            methods.add(method);
        }
    }
    t.end();
});

t.test('every primitive generates at least one file per kind', t => {
    for (const primitive of PRIMITIVES) {
        for (const kind of primitive.kinds) {
            const files = primitive.files({...context, kind});
            t.ok(files.length > 0, `${primitive.id}/${kind} produces files`);
            for (const file of files) {
                t.ok(file.path.length > 0, `${primitive.id}/${kind} path is non-empty`);
                t.notOk(file.path.startsWith('/'), `${primitive.id}/${kind} path is relative`);
                t.notOk(
                    file.path.includes('..'),
                    `${primitive.id}/${kind} path does not escape the root`,
                );
            }
        }
    }
    t.end();
});
