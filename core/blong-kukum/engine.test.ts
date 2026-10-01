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
    templateTokens,
    tripleName,
    walk,
    withMarker,
} from './engine.ts';
import {REALM_TEMPLATE_ROOT, methodName} from './operation.ts';
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

/**
 * A template walk has to agree with `listTemplateFiles`, which globs the shared
 * ignore list — including the nested entry that keeps one package's memory out
 * of another's scaffold.
 */
t.test('walk skips everything the shared ignore list names', async t => {
    const root = mkdtempSync(join(tmpdir(), 'kukum-'));
    const place = (path: string): void => {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), '');
    };
    try {
        for (const path of [
            'package.json',
            'src/stories/Item.stories.tsx',
            'meta/model/itemModel.ts',
            // Ignored: the shared list's own entries, at the root and nested.
            '.github/memory/todo.md',
            '.github/memory/nested/decision.md',
            '.ci-report/report.json',
            'coverage/index.html',
            'node_modules/pkg/index.js',
            'test/item.play.ts-snapshots/browse.png',
            'storybook-static/index.html',
        ]) {
            place(path);
        }
        const files = (await walk(host, root)).map(path =>
            relative(root, path).split('\\').join('/'),
        );
        t.same(
            files.sort(),
            ['meta/model/itemModel.ts', 'package.json', 'src/stories/Item.stories.tsx'],
            'template content is walked, generated output and memory are not',
        );
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

/** The single file a `storybook`/`model` kind produces, by path. */
const fileOf = (primitive: string, kind: string, path: string): string => {
    const descriptor = getPrimitive(primitive);
    t.ok(descriptor, `primitive '${primitive}' exists`);
    const file = descriptor?.files({...context, kind}).find(candidate => candidate.path === path);
    t.ok(file, `${primitive}/${kind} produces ${path}`);
    return file?.content ?? '';
};

/**
 * The generators that are easy to get subtly wrong, asserted on their *content*.
 *
 * Each of these was wrong once: `withBlong` imported from `storyHelper` (which
 * exports `page`/`portal`), a `main` option the factory does not accept, a
 * story importing a component nobody generates, and a mock fixture built with
 * the `fixture()` factory that describes mock OpenAPI documents rather than the
 * sample rows the mock adapter reads.
 */
t.test('storybook and model templates keep their two-factory contract', t => {
    const main = fileOf('storybook', 'main', '.storybook/main.ts');
    t.match(main, /defineBlongStorybookMain\(\{importMetaDirname/, 'main passes importMetaDirname');
    t.notMatch(main, /stories:/, 'main does not pass the unsupported `stories` option');

    const preview = fileOf('storybook', 'preview', '.storybook/preview.tsx');
    t.match(
        preview,
        /import \{defineBlongStorybookPreview\} from '@feasibleone\/blong-browser\/storybook\.tsx'/,
        'preview imports the preview factory from storybook.tsx',
    );
    t.notMatch(preview, /storyHelper/, 'preview does not take its decorator from storyHelper');
    t.match(
        preview,
        /defineBlongStorybookPreview\(browser, \{backend: true\}\)/,
        'preview decorates with the composed entry and switches the backend item on',
    );
    t.match(
        preview,
        /from '\.\.\/index\.browser\.ts'/,
        'preview composes index.browser.ts, which carries the portal port',
    );

    const story = fileOf('storybook', 'story', 'src/stories/Item.stories.tsx');
    t.match(story, /from '@feasibleone\/blong-browser\/storyHelper'/, 'story uses storyHelper');
    t.match(story, /page\('test\.item\.browse'\)/, 'story renders the model browse page');
    t.match(story, /page\('test\.item\.open', 101\)/, 'story renders an open page');
    t.notMatch(story, /\.\.\/components\//, 'story does not import a component nobody generates');
    t.ok(
        (getPrimitive('storybook')?.files({...context, kind: 'story'})[0]?.notices ?? []).some(
            notice => /--kind=fixture/.test(notice),
        ),
        'story tells the caller to generate the fixture its rows come from',
    );
    t.ok(
        (getPrimitive('storybook')?.files({...context, kind: 'story'})[0]?.notices ?? []).some(
            notice => /same ids as the/.test(notice),
        ),
        'story tells the caller the Open record must exist in the fixture',
    );

    const portalStory = fileOf('storybook', 'portal', 'src/stories/Test.stories.tsx');
    t.match(
        portalStory,
        /import \{portal\} from '@feasibleone\/blong-browser\/storyHelper'/,
        'portal story imports the portal helper',
    );
    t.match(portalStory, /title: 'Test\/Portal'/, 'portal story is titled <Subject>/Portal');
    t.match(portalStory, /export const Test = portal\(\)/, 'portal story renders the shell');
    t.notMatch(portalStory, /page\(/, 'portal story renders the shell, not a model page');

    const fixture = fileOf('model', 'fixture', 'meta/fixture/testFixture.ts');
    t.match(fixture, /import \{handler\} from '@feasibleone\/blong'/, 'fixture imports handler');
    t.notMatch(
        fixture,
        /export default fixture\(/,
        'fixture does not use the mock-OpenAPI fixture() factory',
    );
    t.match(
        fixture,
        /async function testFixture/,
        'fixture handler is named <subject>Fixture, which is how the mock adapter finds it',
    );
    t.end();
});

/**
 * A model story renders through the mock adapter, which reaches its sample rows
 * only if the realm's `browser.ts` lists `meta/fixture` — the browser platform
 * loads nothing it is not told about. The descriptor therefore splices the
 * folder into that entry itself, and says so only when it cannot.
 */
t.test('storybook registers the fixture folder in browser.ts', t => {
    const root = mkdtempSync(join(tmpdir(), 'kukum-'));
    const browserPath = join(root, 'browser.ts');
    /** A realm entry in the shape a hand-written realm has (no generated marker). */
    const realmEntry = (children: string): string => `import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: ${children},
}));
`;
    try {
        const storybook = getPrimitive('storybook');
        t.ok(storybook?.compose, 'storybook descriptor composes');
        if (!storybook?.compose) return t.end();
        const story = {...context, kind: 'story'};
        const noticesOf = (changes: ReturnType<typeof plan>): string[] =>
            changes.flatMap(change => change.notices ?? []);

        writeFileSync(
            browserPath,
            realmEntry(`globalThis.window
        ? import.meta.glob(['./meta/model/**/*.ts'])
        : ['./meta/model']`),
        );
        const changes = plan(host, storybook, {root, context: story});
        const entry = changes.find(change => change.path === 'browser.ts');
        t.ok(entry, 'browser.ts is part of the plan');
        t.equal(entry?.action, 'overwrite', 'the entry is rewritten');
        t.match(
            entry?.content ?? '',
            /\['\.\/meta\/model\/\*\*\/\*\.ts', '\.\/meta\/fixture\/\*\*\/\*\.ts'\]/,
            'the glob list gains the pattern',
        );
        t.match(
            entry?.content ?? '',
            /: \['\.\/meta\/model', '\.\/meta\/fixture'\]/,
            'the non-window list gains the folder',
        );
        t.notOk(entry?.handWritten, 'a splice is safe to write even into a hand-written entry');
        t.notOk(
            noticesOf(changes).some(notice => /could not be registered/.test(notice)),
            'no warning when the folder was registered',
        );
        t.same(
            apply(host, changes).written,
            ['src/stories/Item.stories.tsx', 'browser.ts'],
            'both files are written',
        );

        // Already registered — the kopi template does this — so re-adding a story
        // is a no-op for the entry, and there is nothing to explain either.
        const again = plan(host, storybook, {root, context: story});
        t.notOk(
            again.some(change => change.path === 'browser.ts'),
            'idempotent: a registered folder leaves the entry untouched',
        );
        t.same(apply(host, again).written, [], 'nothing is rewritten at all');

        // No entry to extend: the caller is told which two lists to touch.
        rmSync(browserPath);
        const missing = noticesOf(plan(host, storybook, {root, context: story}));
        t.ok(
            missing.some(notice => /browser\.ts was not found/.test(notice)),
            'a missing browser.ts is reported',
        );
        t.ok(
            missing.some(notice => /non-window branch/.test(notice)),
            'the notice says where the folder has to be listed',
        );

        // An entry that lists no meta folder is left alone, and reported rather
        // than half-spliced.
        writeFileSync(browserPath, realmEntry(`['./browser']`));
        const unrelated = plan(host, storybook, {root, context: story});
        t.notOk(
            unrelated.some(change => change.path === 'browser.ts'),
            'an entry with no meta list is not rewritten',
        );
        t.ok(
            noticesOf(unrelated).some(notice => /lists no \.\/meta folder/.test(notice)),
            'the reason is reported',
        );

        // Only a model story needs the rows.
        const portal = plan(host, storybook, {root, context: {...context, kind: 'portal'}});
        t.notOk(
            portal.some(change => change.path === 'browser.ts'),
            'the portal story does not extend the entry',
        );
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
    t.end();
});

/**
 * The Storybook artifacts exist twice — once as a descriptor here, once as a file
 * in the `blong-kopi` template that a scaffolded realm receives verbatim — and
 * the copies are edited by hand. They had already drifted apart in both
 * directions before this test existed, which is exactly what it is for: a change
 * to either copy fails here, and the message names the file to look at.
 *
 * `meta/fixture` is compared structurally instead of byte for byte: its comments
 * and its sample rows are the template's own (they mirror its test seed, and its
 * Open story opens record 1), so only the shape the descriptor promises is
 * asserted there.
 */
t.test('the template files are the descriptor output, token for token', t => {
    // The same substitution a scaffold applies, so a token neither copy knows
    // about cannot make this comparison pass by accident.
    const fromTemplate = (path: string): string =>
        templateTokens(
            readFileSync(join(REALM_TEMPLATE_ROOT, path), 'utf8'),
            context.subject,
            context.object,
        );
    const fromDescriptor = (primitive: string, kind: string, path: string): string => {
        const file = getPrimitive(primitive)
            ?.files({...context, kind})
            .find(f => f.path === path);
        t.ok(file, `${primitive}/${kind} produces ${path}`);
        return file?.content ?? '';
    };

    t.ok(
        existsSync(join(REALM_TEMPLATE_ROOT, '.storybook', 'main.ts')),
        'the blong-kopi template is a sibling package',
    );
    for (const [kind, generatedPath, templatePath] of [
        ['main', '.storybook/main.ts', '.storybook/main.ts'],
        ['preview', '.storybook/preview.tsx', '.storybook/preview.tsx'],
        ['story', 'src/stories/Item.stories.tsx', 'src/stories/$Object.stories.tsx'],
        ['portal', 'src/stories/Test.stories.tsx', 'src/stories/$Subject.stories.tsx'],
    ] as const) {
        t.equal(
            fromDescriptor('storybook', kind, generatedPath),
            fromTemplate(templatePath),
            `${templatePath} is storybook/${kind}'s output, so the two are edited together`,
        );
    }

    /** The body of the rows array: everything after the `'<subject>.<object>': [` key. */
    const rows = (source: string): string => {
        const key = `'${context.subject}.${context.object}': [`;
        return source.slice(source.indexOf(key) + key.length);
    };
    /** The field names of a fixture's first sample row. */
    const fields = (source: string): string[] =>
        (/\{[^}]*\}/.exec(rows(source))?.[0] ?? '')
            .slice(1, -1)
            .split(',')
            .map(field => field.split(':')[0]?.trim() ?? '')
            .filter(Boolean);

    const fixture = fromDescriptor('model', 'fixture', `meta/fixture/${context.subject}Fixture.ts`);
    const fixtureTemplate = fromTemplate('meta/fixture/$subjectFixture.ts');
    for (const [label, source] of [
        ['the descriptor', fixture],
        ['the template', fixtureTemplate],
    ] as const) {
        t.match(source, /export default handler\(/, `${label} writes a plain handler()`);
        t.match(
            source,
            new RegExp(`async function ${context.subject}Fixture`),
            `${label} names the handler <subject>Fixture`,
        );
        t.match(
            source,
            new RegExp(`'${context.subject}\\.${context.object}': \\[`),
            `${label} keys the rows by <subject>.<object>`,
        );
    }
    for (const field of fields(fixture)) {
        t.ok(
            fields(fixtureTemplate).includes(field),
            `the template's first row carries '${field}', so a scaffolded realm shows the shape`,
        );
    }
    t.end();
});
