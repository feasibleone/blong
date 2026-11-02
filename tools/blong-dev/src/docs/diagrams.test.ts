/**
 * Unit tests for the diagram register, the renderer call and the poster capture.
 *
 * Three failures are worth a test here because each is quiet where it happens: a register entry
 * whose output is not a `.html` file stages something no frame can open, a renderer that is not
 * installed must read as an instruction rather than as a crash, and a poster written to a missing
 * directory leaves a page that shows an empty frame with no file behind it.
 *
 * The renderer is faked — a script that writes the JSON receipt a real run writes — so the contract
 * between this module and the CLI is exercised without the CLI, and without a browser.
 */

import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import t from 'tap';

import {repoRoot} from '../report/reportPaths.ts';
import {
    DIAGRAM_MANIFEST,
    archifyCandidates,
    capturePosters,
    loadDiagrams,
    renderDiagram,
    rendererEnvironment,
    resolveArchify,
    type IPublishedDiagram,
    type IPosterBrowser,
} from './diagrams.ts';

/** A register entry, as the file writes it. */
function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: 'a diagram',
        type: 'architecture',
        candidate: 'draw/archify/a.json',
        output: 'static/diagrams/a.html',
        poster: {light: 'docs/img/a-light.png', dark: 'docs/img/a-dark.png'},
        height: '600px',
        page: 'concepts/a.md',
        ...overrides,
    };
}

/** A repository root with one registered diagram and one authored candidate. */
function fixture(diagrams: Record<string, unknown> = {a: entry()}): string {
    const root = mkdtempSync(join(tmpdir(), 'blong-diagrams-'));
    mkdirSync(join(root, 'docs/blong/draw/archify'), {recursive: true});
    writeFileSync(join(root, DIAGRAM_MANIFEST), JSON.stringify({version: 1, diagrams}));
    writeFileSync(join(root, 'docs/blong/draw/archify/a.json'), '{"schema_version":1}');
    return root;
}

/** A renderer that writes the receipt a real run writes, and nothing else. */
function fakeArchify(root: string, receipt: unknown): string {
    const path = join(root, 'archify.mjs');
    writeFileSync(
        path,
        [
            "import {mkdirSync, writeFileSync} from 'node:fs';",
            "import {dirname} from 'node:path';",
            '// node <archify> finalize <type> <candidate> <output>',
            'const output = process.argv[5];',
            'mkdirSync(dirname(output), {recursive: true});',
            "writeFileSync(output, '<html></html>');",
            `process.stdout.write(${JSON.stringify(JSON.stringify(receipt))});`,
            '',
        ].join('\n'),
    );
    return path;
}

/** A browser that returns one byte per theme, so the test can tell the two files apart. */
function fakeBrowser(): IPosterBrowser & {urls: string[]; themes: string[]; closed: boolean} {
    const state = {
        urls: [] as string[],
        themes: [] as string[],
        closed: false,
        async capture(url: string, theme: 'light' | 'dark') {
            state.urls.push(url);
            state.themes.push(theme);
            return Buffer.from(theme === 'light' ? 'l' : 'd');
        },
        async close() {
            state.closed = true;
        },
    };
    return state;
}

t.test('the repository register resolves every entry', async t => {
    const root = repoRoot(import.meta.dirname);
    const diagrams = loadDiagrams(root);
    t.ok(diagrams.length >= 7, `${diagrams.length} diagram(s) registered`);
    for (const diagram of diagrams) {
        t.match(
            diagram.output,
            /docs[/\\]blong[/\\]static[/\\]diagrams[/\\][a-z-]+[.]html$/,
            `${diagram.slug} renders under static/diagrams/`,
        );
        t.ok(existsSync(diagram.candidate), `${diagram.slug} has its candidate`);
        t.ok(existsSync(diagram.page), `${diagram.slug} names a page that exists`);
        t.match(diagram.height, /^\d+px$/, `${diagram.slug} has a frame height`);
    }
    // Sorted by slug, so `docs diagram` reports the same order twice.
    t.same(
        diagrams.map(diagram => diagram.slug),
        [...diagrams.map(diagram => diagram.slug)].sort(),
        'the register is read in a stable order',
    );
});

t.test('a register path is resolved relative to the docs package', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root);
    t.same(diagram?.candidate, join(root, 'docs/blong/draw/archify/a.json'));
    t.same(diagram?.output, join(root, 'docs/blong/static/diagrams/a.html'));
    t.same(diagram?.poster.dark, join(root, 'docs/blong/docs/img/a-dark.png'));
    rmSync(root, {recursive: true, force: true});
});

t.test('the renderer is found without an environment variable', async t => {
    const root = fixture();
    const script = fakeArchify(root, {ok: true, gates: {}});
    const home = mkdtempSync(join(tmpdir(), 'blong-home-'));
    mkdirSync(join(home, '.agents/skills/archify/bin'), {recursive: true});
    writeFileSync(join(home, '.agents/skills/archify/bin/archify.mjs'), '');
    t.same(resolveArchify(root, undefined, {}), undefined, 'nothing installed, nothing run');
    t.same(
        resolveArchify(root, undefined, {HOME: home}),
        join(home, '.agents/skills/archify/bin/archify.mjs'),
        'the agent skill is found by itself',
    );
    t.same(resolveArchify(root, script, {}), script, '--archify wins');
    t.same(resolveArchify(root, undefined, {ARCHIFY_BIN: script}), script, 'ARCHIFY_BIN is next');
    t.same(
        resolveArchify(root, '/nope/archify.mjs', {HOME: home}),
        join(home, '.agents/skills/archify/bin/archify.mjs'),
        'a path that does not exist falls through to the installed copy',
    );
    rmSync(home, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
});

t.test('a dependency of the docs package is the first place looked', async t => {
    const root = fixture();
    const dependency = join(root, 'docs/blong/node_modules/archify/bin/archify.mjs');
    mkdirSync(dirname(dependency), {recursive: true});
    writeFileSync(dependency, '');
    t.same(archifyCandidates(root, {})[0], dependency, 'the package dependency comes first');
    t.same(resolveArchify(root, undefined, {}), dependency, 'and is used without any variable');
    rmSync(root, {recursive: true, force: true});
});

t.test('the renderer environment supplies a browser and no sandbox', async t => {
    const sandboxed = await rendererEnvironment({sandbox: true});
    t.same(sandboxed['ARCHIFY_CHROME_NO_SANDBOX'], process.env['ARCHIFY_CHROME_NO_SANDBOX']);
    const relaxed = await rendererEnvironment();
    if (process.env['ARCHIFY_CHROME_NO_SANDBOX'] === undefined) {
        t.same(relaxed['ARCHIFY_CHROME_NO_SANDBOX'], '1', 'the sandbox is off unless asked for');
    }
    // A browser is either inherited or resolved from Playwright; the renderer needs one of them.
    t.ok(
        relaxed['ARCHIFY_CHROME'] !== undefined && relaxed['ARCHIFY_CHROME'] !== '' ||
            process.env['ARCHIFY_CHROME'] === undefined,
        'a browser is offered when one is installed',
    );
});

t.test('a passing render reports its gates and writes the output', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root) as [IPublishedDiagram];
    const script = fakeArchify(root, {
        ok: true,
        gates: {validate: 'pass', deliver: 'pass', check: 'pass', 'browser-check': 'pass'},
    });
    const result = renderDiagram(root, diagram, script);
    t.equal(result.ok, true);
    t.equal(result.gates['browser-check'], 'pass');
    t.ok(existsSync(diagram.output), 'the rendered file is where the register said');
    rmSync(root, {recursive: true, force: true});
});

t.test('a failing gate is reported as one line, not as a stack trace', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root) as [IPublishedDiagram];
    const script = fakeArchify(root, {
        ok: false,
        gates: {validate: 'fail'},
        diagnostics: [{code: 'layout/constraint', message: 'node "a" is too narrow'}],
    });
    const result = renderDiagram(root, diagram, script);
    t.equal(result.ok, false);
    t.equal(result.problem, 'node "a" is too narrow', 'the first diagnostic is the problem');
    rmSync(root, {recursive: true, force: true});
});

t.test('a renderer that cannot start reports what it said', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root) as [IPublishedDiagram];
    const result = renderDiagram(root, diagram, join(root, 'not-installed.mjs'));
    t.equal(result.ok, false);
    t.match(result.problem ?? '', /Cannot find module/, 'the node error is the evidence');
    rmSync(root, {recursive: true, force: true});
});

t.test('--dry-run renders nothing and still says what it would do', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root) as [IPublishedDiagram];
    const result = renderDiagram(root, diagram, '/nope/archify.mjs', {dryRun: true});
    t.equal(result.ok, true);
    t.notOk(existsSync(diagram.output), 'nothing was written');
    rmSync(root, {recursive: true, force: true});
});

t.test('both posters are written, in the themes the register names', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root) as [IPublishedDiagram];
    mkdirSync(join(root, 'docs/blong/static/diagrams'), {recursive: true});
    writeFileSync(diagram.output, '<html></html>');
    const browser = fakeBrowser();
    await capturePosters(diagram, browser);
    t.same(browser.themes, ['light', 'dark'], 'one capture per theme');
    t.match(browser.urls[0] ?? '', /^file:\/\/.*a[.]html$/, 'the rendered file is photographed');
    t.equal(readFileSync(diagram.poster.light, 'utf8'), 'l');
    t.equal(readFileSync(diagram.poster.dark, 'utf8'), 'd');
    rmSync(root, {recursive: true, force: true});
});

t.test('a poster is not captured from a file that was never rendered', async t => {
    const root = fixture();
    const [diagram] = loadDiagrams(root) as [IPublishedDiagram];
    await t.rejects(
        capturePosters(diagram, fakeBrowser()),
        /was not rendered/,
        'the missing render is named',
    );
    rmSync(root, {recursive: true, force: true});
});
