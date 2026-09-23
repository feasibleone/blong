/**
 * `blong-dev docs` — the writer and validator of the documentation site's generated artefacts.
 *
 * Some pages in `docs/blong/docs/` are not written, they are **generated**: sequence diagrams
 * rendered from a real run (the semantic-log renderer), screenshots captured by Playwright, and
 * architecture diagrams drawn from the live registry. Those artefacts are committed, so the docs
 * build stays a plain Docusaurus build with no monorepo dependency, and regenerating them is a
 * run rather than an edit.
 *
 * The register is `docs/blong/docs-artifacts.json`, one entry per artefact. It lives in the docs
 * package because the docs package is what a README's "how do I refresh this picture" question
 * lands in, and because a generated file and the page that shows it must be reviewed together.
 *
 * Commands are run through a shell (`sh -c`) so an entry can carry the environment prefix its
 * generator needs (`SEMANTIC_LOG_UPDATE_DIAGRAMS=1`, `BLONG_REGENERATE_DIAGRAMS=1`), and in the
 * owning package's directory so a package's own scripts and relative paths keep working.
 *
 * Usage:
 *   blong-dev docs list [--json]
 *   blong-dev docs generate [--only <id[,id]>] [--filter <glob>] [--dry-run]
 *   blong-dev docs check    [--only <id[,id]>] [--filter <glob>]
 *
 * `check` is the gate: it snapshots every destination, regenerates, and **restores** the
 * originals, so it reports staleness without leaving a dirty tree. It exits non-zero when an
 * artefact differs from what its generator produces, which is the signal that somebody edited a
 * generated file or changed the code the diagram is drawn from.
 *
 * The generators are deterministic by design — a call is placed by the counter path its caller
 * assigned, and no count comes from the clock — so an up-to-date artefact regenerates to the same
 * bytes and `check` can compare instead of guessing. That is why this command can be run in CI.
 */

import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import stripJsonComments from 'strip-json-comments';

import {serveStatic} from '../docs/staticServer.ts';
import {findVisualPages} from '../docs/visualPages.ts';
import {repoRoot} from '../report/reportPaths.ts';

/** Repository-relative path of the register. */
const MANIFEST = 'docs/blong/docs-artifacts.json';

/** How a generated artefact relates to the file it lives in. */
type ArtifactKind = 'file' | 'mermaid-inline' | 'png';

/** The part of an artefact that says how to regenerate it, and what to call it in a message. */
interface IGenerator {
    /** Label used in progress and error messages. */
    id: string;
    /** Repository-relative package the generator runs in. */
    package: string;
    /** Shell command that regenerates the artefact, run in {@link package}. */
    command: string;
}

/** One entry of the register. */
interface IArtifact extends IGenerator {
    kind: ArtifactKind;
    /** Repository-relative path of the file the artefact lives in. */
    destination: string;
    /** For `mermaid-inline`: the value of `<id>` in `<!-- BEGIN <id> -->`. */
    marker?: string;
    /** For `mermaid-inline`: the documentation page that embeds the block. */
    doc?: string;
}

/** Options shared by `generate` and `check`. */
interface ISelection {
    only: string[];
    filter?: string;
}

/** Read and validate the register. */
function loadArtifacts(root: string): IArtifact[] {
    const file = join(root, MANIFEST);
    if (!existsSync(file)) {
        process.stderr.write(`blong-dev docs: no register at ${MANIFEST}\n`);
        process.exit(1);
    }
    let parsed: unknown;
    try {
        // The register is JSONC so a maintainer can comment an entry out while investigating it.
        parsed = JSON.parse(stripJsonComments(readFileSync(file, 'utf8')));
    } catch (error) {
        process.stderr.write(
            `blong-dev docs: ${MANIFEST} is not valid JSON — ${(error as Error).message}\n`,
        );
        process.exit(1);
    }
    const artifacts = (parsed as {artifacts?: unknown}).artifacts;
    if (!Array.isArray(artifacts)) {
        process.stderr.write(`blong-dev docs: ${MANIFEST} has no "artifacts" array\n`);
        process.exit(1);
    }
    return artifacts.map((entry, index) => validate(entry, index));
}

/** Reject a malformed entry with enough context to fix it without opening this file. */
function validate(entry: unknown, index: number): IArtifact {
    const fail = (problem: string): never => {
        process.stderr.write(`blong-dev docs: ${MANIFEST} artifacts[${index}]: ${problem}\n`);
        process.exit(1);
    };
    if (typeof entry !== 'object' || entry === null) fail('not an object');
    const record = entry as Record<string, unknown>;
    const text = (key: string): string =>
        typeof record[key] === 'string' && record[key] !== ''
            ? (record[key] as string)
            : fail(`"${key}" is missing or not a non-empty string`);
    const kind = record.kind;
    if (kind !== 'file' && kind !== 'mermaid-inline' && kind !== 'png') {
        fail('"kind" must be "file", "mermaid-inline" or "png"');
    }
    const artifact: IArtifact = {
        id: text('id'),
        kind: kind as ArtifactKind,
        destination: text('destination'),
        package: text('package'),
        command: text('command'),
    };
    // A marker is what makes an inline block findable, so an inline artefact without one would
    // silently rewrite nothing. Fail loudly instead.
    if (artifact.kind === 'mermaid-inline') {
        artifact.marker = text('marker');
    } else if (typeof record.marker === 'string') {
        fail('"marker" belongs to "mermaid-inline" artefacts only');
    }
    if (typeof record.doc === 'string') artifact.doc = record.doc;
    return artifact;
}

/** Expand `*` wildcards into a regular expression, anchored at both ends. */
function globToRegExp(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}

/** Apply `--only` and `--filter`, or exit when they select nothing. */
function select(artifacts: IArtifact[], options: ISelection): IArtifact[] {
    let selected = artifacts;
    if (options.only.length > 0) {
        const wanted = new Set(options.only);
        const unknown = options.only.filter(id => !artifacts.some(a => a.id === id));
        if (unknown.length > 0) {
            process.stderr.write(
                `blong-dev docs: unknown artefact id(s): ${unknown.join(', ')}\n` +
                    `Known ids: ${artifacts.map(a => a.id).join(', ')}\n`,
            );
            process.exit(1);
        }
        selected = selected.filter(artifact => wanted.has(artifact.id));
    }
    if (options.filter !== undefined) {
        const pattern = globToRegExp(options.filter);
        selected = selected.filter(artifact => pattern.test(artifact.id));
    }
    if (selected.length === 0) {
        process.stderr.write('blong-dev docs: no artefacts selected\n');
        process.exit(1);
    }
    return selected;
}

/** Parse the flags `generate` and `check` share. */
function parseSelection(args: string[]): ISelection {
    const selection: ISelection = {only: []};
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--only') {
            const value = args[++index];
            if (value === undefined) {
                process.stderr.write('blong-dev docs: --only needs an id\n');
                process.exit(1);
            }
            selection.only.push(...value.split(',').filter(Boolean));
        } else if (arg.startsWith('--only=')) {
            selection.only.push(...arg.slice('--only='.length).split(',').filter(Boolean));
        } else if (arg === '--filter') {
            const value = args[++index];
            if (value === undefined) {
                process.stderr.write('blong-dev docs: --filter needs a glob\n');
                process.exit(1);
            }
            selection.filter = value;
        } else if (arg.startsWith('--filter=')) {
            selection.filter = arg.slice('--filter='.length);
        }
    }
    return selection;
}

/** Run one generator invocation. Returns true on success. */
function runGenerator(root: string, generator: IGenerator, quiet: boolean): boolean {
    const cwd = join(root, generator.package);
    const result = spawnSync('sh', ['-c', generator.command], {
        cwd,
        // Generators are chatty (tap, playwright) and their output is only interesting when they
        // fail, so `check` captures it; `generate` streams it so a long run is not silent.
        stdio: quiet ? 'pipe' : 'inherit',
        encoding: 'utf8',
    });
    if (result.error) {
        process.stderr.write(
            `blong-dev docs: ${generator.id}: cannot run in ${generator.package} — ${result.error.message}\n`,
        );
        return false;
    }
    if (result.status !== 0) {
        process.stderr.write(
            `blong-dev docs: ${generator.id}: generator failed (exit ${result.status ?? 'signal'})` +
                ` in ${generator.package}\n`,
        );
        if (quiet) {
            const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
            if (output) process.stderr.write(`${output}\n`);
        }
        return false;
    }
    return true;
}

/** One generator invocation, and every registered artefact it produces. */
interface IGeneratorRun extends IGenerator {
    ids: string[];
}

/**
 * Collapse the selection to one entry per distinct command.
 *
 * One generator often produces several artefacts — the semantic-log test writes the package's
 * artifact *and* both marked blocks of the page that embeds it — so running the command once per
 * registered artefact would render the same diagrams three times.
 */
function generatorRuns(artifacts: IArtifact[]): IGeneratorRun[] {
    const runs = new Map<string, IGeneratorRun>();
    for (const artifact of artifacts) {
        const key = `${artifact.package}\u0000${artifact.command}`;
        const existing = runs.get(key);
        if (existing === undefined) {
            runs.set(key, {
                id: artifact.id,
                package: artifact.package,
                command: artifact.command,
                ids: [artifact.id],
            });
        } else {
            existing.ids.push(artifact.id);
            existing.id = existing.ids.join(', ');
        }
    }
    return [...runs.values()];
}

/** Read a file, distinguishing "absent" from "empty" so a restore can delete what it created. */
function readOrUndefined(file: string): string | undefined {
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** Put a snapshot back, deleting files the generators created that were not there before. */
function restore(file: string, content: string | undefined): void {
    if (content === undefined) {
        if (existsSync(file)) rmSync(file);
        return;
    }
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, content);
}

/** `blong-dev docs list [--json]` */
function list(root: string, args: string[]): void {
    const artifacts = loadArtifacts(root);
    const asJson = args.includes('--json');
    const rows = artifacts.map(artifact => ({
        id: artifact.id,
        kind: artifact.kind,
        package: artifact.package,
        destination: artifact.destination,
        ...(artifact.marker === undefined ? {} : {marker: artifact.marker}),
        present: existsSync(join(root, artifact.destination)),
    }));
    if (asJson) {
        process.stdout.write(`${JSON.stringify(rows, null, 4)}\n`);
        return;
    }
    // A table wide enough to hold a repository-relative path wraps in an ordinary terminal, which
    // is exactly where this command is read. One block per artefact instead: the id and its
    // package on one line, the destination and its marker indented under it.
    const idWidth = Math.max(...artifacts.map(artifact => artifact.id.length));
    const kindWidth = Math.max(...artifacts.map(artifact => artifact.kind.length));
    process.stdout.write(`${MANIFEST} — ${artifacts.length} artefact(s)\n`);
    for (const artifact of artifacts) {
        const ok = existsSync(join(root, artifact.destination));
        process.stdout.write(
            `\n  ${artifact.id.padEnd(idWidth)}  ${artifact.kind.padEnd(kindWidth)}  ` +
                `${artifact.package}\n`,
        );
        process.stdout.write(`      ${artifact.destination}${ok ? '' : '  (MISSING)'}\n`);
        if (artifact.marker !== undefined) {
            process.stdout.write(`      marker: ${artifact.marker}\n`);
        }
    }
    process.stdout.write(
        '\nRegenerate with `blong-dev docs generate`, verify with `blong-dev docs check`.\n',
    );
}

/** `blong-dev docs generate [...]` */
function generate(root: string, args: string[]): void {
    const dryRun = args.includes('--dry-run');
    const artifacts = select(loadArtifacts(root), parseSelection(args));
    const runs = generatorRuns(artifacts);
    if (dryRun) {
        for (const run of runs) {
            process.stdout.write(`cd ${run.package} && ${run.command}\n`);
            process.stdout.write(`# produces ${run.ids.join(', ')}\n`);
        }
        return;
    }
    let failed = 0;
    for (const run of runs) {
        process.stderr.write(`blong-dev docs: generate ${run.ids.join(', ')}\n`);
        if (!runGenerator(root, run, false)) failed++;
    }
    if (failed > 0) {
        process.stderr.write(`blong-dev docs: ${failed} generator(s) failed\n`);
        process.exit(1);
    }
    process.stderr.write(`blong-dev docs: ${artifacts.length} artefact(s) regenerated\n`);
}

/** `blong-dev docs check [...]` */
function check(root: string, args: string[]): void {
    const artifacts = select(loadArtifacts(root), parseSelection(args));
    // A screenshot is not byte-compared and its generator is not run here. PNG bytes depend on
    // font rendering, so the same page captured twice differs, and running the capture would
    // rewrite the committed picture that a reader is meant to review. What a `png` artefact can be
    // held to is that it is there and is not empty — the content is reviewed like any other
    // committed image. That also keeps `check` free of a browser and of the app servers a capture
    // needs, so it stays a check rather than a test run.
    const images = artifacts.filter(artifact => artifact.kind === 'png');
    const missing: string[] = [];
    for (const image of images) {
        const file = join(root, image.destination);
        const size = existsSync(file) ? statSync(file).size : 0;
        if (size === 0) missing.push(image.destination);
    }

    const compared = artifacts.filter(artifact => artifact.kind !== 'png');
    // Several artefacts can share a destination (one page, two marked blocks), so the snapshot is
    // keyed by file, not by artefact, and is taken before anything runs.
    const files = [...new Set(compared.map(a => join(root, a.destination)))];
    const before = new Map(files.map(file => [file, readOrUndefined(file)]));
    let failed = 0;
    try {
        for (const run of generatorRuns(compared)) {
            process.stderr.write(`blong-dev docs: check ${run.ids.join(', ')}\n`);
            if (!runGenerator(root, run, true)) failed++;
        }
        const stale: string[] = [];
        for (const file of files) {
            if (readOrUndefined(file) !== before.get(file)) {
                stale.push(relative(root, file).split('\\').join('/'));
            }
        }
        if (missing.length > 0) {
            process.stderr.write(
                '\nblong-dev docs: missing or empty image(s):\n' +
                    missing.map(file => `  ${file}\n`).join('') +
                    "Run `blong-dev docs generate --filter 'png:*'` and commit the result.\n",
            );
        }
        if (stale.length === 0 && missing.length === 0 && failed === 0) {
            process.stdout.write(
                `blong-dev docs: ${artifacts.length} artefact(s) up to date` +
                    (images.length === 0 ? '\n' : ` (${images.length} image(s) present)\n`),
            );
            return;
        }
        if (stale.length > 0) {
            process.stderr.write(
                '\nblong-dev docs: stale artefact(s) — the committed file is not what the ' +
                    'generator produces:\n' +
                    stale.map(file => `  ${file}\n`).join('') +
                    'Run `blong-dev docs generate` and commit the result.\n',
            );
        }
    } finally {
        // Restore unconditionally: `check` reports, it does not rewrite, so a run in CI or on a
        // dirty tree never leaves the working copy changed behind the caller's back.
        for (const file of files) restore(file, before.get(file));
    }
    process.exit(1);
}

/**
 * `blong-dev docs verify [--base <url>] [--filter <glob>] [--json]`
 *
 * Load every page that carries a mermaid diagram in a real browser, and check that each diagram
 * actually drew.
 *
 * This exists because nothing else can make that check. `npm run build` compiles a page and
 * `docusaurus serve` hands it back, but neither parses mermaid — which runs in the browser. The
 * renderer's own unit tests mock mermaid, because the real parser measures text with `getBBox` and
 * jsdom does not implement it (`MermaidRenderer.test.tsx`, F-212). So a mermaid syntax error — a
 * label with an extra backtick, a backslash-escaped quote — compiles, serves and passes every test,
 * and shows the reader an error box where a diagram should be.
 *
 * The assertion is per page, and it is a count: a block that fails to parse renders nothing at all,
 * so a page owing two diagrams and showing one has a broken diagram even when the console is quiet.
 */
async function verify(root: string, args: string[]): Promise<void> {
    const explicitBase = valueOf(args, '--base');
    const filter = valueOf(args, '--filter');
    const asJson = args.includes('--json');

    const docsDir = join(root, 'docs/blong/docs');
    if (!existsSync(docsDir)) {
        process.stderr.write('blong-dev docs: docs/blong/docs not found\n');
        process.exit(1);
    }
    const all = findVisualPages(docsDir);
    const pages =
        filter === undefined ? all : all.filter(page => globToRegExp(filter).test(page.file));
    if (pages.length === 0) {
        process.stderr.write('blong-dev docs: no pages with diagrams or images selected\n');
        process.exit(1);
    }
    const blocks = pages.reduce((total, page) => total + page.blocks, 0);
    const imageCount = pages.reduce((total, page) => total + page.images, 0);

    // The build is required when no base is given: verifying a stale build would report on a site
    // nobody is looking at.
    const build = join(root, 'docs/blong/build');
    if (explicitBase === undefined && !existsSync(join(build, 'index.html'))) {
        process.stderr.write(
            'blong-dev docs: docs/blong/build is missing — run `npm run build` in docs/blong\n' +
                'first, or pass --base <url> for a server that is already running.\n',
        );
        process.exit(1);
    }

    // Imported here rather than at module scope: `blong-dev` also lints, tests and reports on
    // machines that will never verify a diagram, and loading a browser driver for them is dead
    // weight.
    const {chromium} = await import('@playwright/test');
    const server = explicitBase === undefined ? await serveStatic(build) : undefined;
    const origin = explicitBase ?? server!.origin;
    const browser = await chromium.launch().catch((error: Error) => {
        throw new Error(
            `cannot launch chromium (${error.message}). Run \`npx playwright install chromium\`.`,
        );
    });

    const failures: Array<{
        file: string;
        route: string;
        drawn: number;
        blocks: number;
        errors: string[];
        imagesFailed: string[];
    }> = [];
    try {
        const context = await browser.newContext();
        for (const page of pages) {
            const tab = await context.newPage();
            const errors: string[] = [];
            tab.on('console', message => {
                // Only mermaid's own complaints. A page may log an unrelated error and still have
                // drawn every diagram; failing on that would make this check unusable.
                if (message.type() === 'error' && /mermaid|lexical|parse/i.test(message.text())) {
                    errors.push(message.text().split('\n')[0].slice(0, 200));
                }
            });
            try {
                await tab.goto(`${origin}/docs/${page.route}`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30_000,
                });
                const drawn = await waitForDiagrams(tab, page.blocks);
                const imagesFailed = await imagesThatFailedToLoad(tab);
                if (drawn < page.blocks || errors.length > 0 || imagesFailed.length > 0) {
                    failures.push({...page, drawn, errors, imagesFailed});
                }
            } catch (error) {
                failures.push({
                    ...page,
                    drawn: 0,
                    errors: [(error as Error).message.split('\n')[0]],
                    imagesFailed: [],
                });
            } finally {
                await tab.close();
            }
        }
        await context.close();
    } finally {
        await browser.close();
        if (server !== undefined) await server.close();
    }

    if (asJson) {
        process.stdout.write(
            `${JSON.stringify({pages: pages.length, blocks, failures}, null, 4)}\n`,
        );
    } else if (failures.length === 0) {
        process.stdout.write(
            `blong-dev docs: ${blocks} diagram(s) and ${imageCount} image(s) on ${pages.length} ` +
                'page(s) all rendered\n',
        );
    } else {
        process.stderr.write(`\nblong-dev docs: ${failures.length} page(s) were not sound:\n`);
        for (const failure of failures) {
            process.stderr.write(
                `  ${failure.file} — drew ${failure.drawn} of ${failure.blocks}\n`,
            );
            for (const error of failure.errors) process.stderr.write(`      ${error}\n`);
            for (const image of failure.imagesFailed) {
                process.stderr.write(`      image did not load: ${image}\n`);
            }
        }
    }
    if (failures.length > 0) process.exit(1);
}

/** The value of `--flag value` or `--flag=value`, if either is present. */
function valueOf(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    if (index !== -1) return args[index + 1];
    return args.find(arg => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

/** Wait until a page has drawn at least `expected` diagrams, or the budget runs out. */
async function waitForDiagrams(
    page: import('@playwright/test').Page,
    expected: number,
    budgetMs = 15_000,
): Promise<number> {
    const deadline = Date.now() + budgetMs;
    let drawn = 0;
    while (Date.now() < deadline) {
        drawn = await page.locator('.docusaurus-mermaid-container svg').count();
        if (drawn >= expected) return drawn;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return drawn;
}

/**
 * The `src` of every image on the page that did not load.
 *
 * `onBrokenLinks: 'throw'` guards internal links but says nothing about images, so a page can
 * reference a picture that was never committed — or whose path moved — and build, serve and pass
 * every test, with the reader getting a broken-image icon.
 *
 * The scroll is not optional: Docusaurus emits `loading="lazy"`, so an image below the fold has not
 * been requested yet, and `naturalWidth` is 0 for one that is simply not loaded *yet* as much as for
 * one that failed. Walking the page first makes the two distinguishable, and the check honest.
 */
async function imagesThatFailedToLoad(page: import('@playwright/test').Page): Promise<string[]> {
    await page.evaluate(async () => {
        const step = Math.max(200, window.innerHeight);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise(resolve => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
    });
    // Sampling `naturalWidth` straight after the scroll reads a picture that is still in flight as a
    // failed one: measured on `concepts/architecture.md`, whichever of its two large PNGs had not
    // finished came back as a failure, and which one that was changed between runs. `complete` is
    // the signal that separates the two — it is true for an image that loaded *and* for one that
    // broke — so waiting for the rendered ones to settle is what makes this report a defect rather
    // than a race.
    await page
        .waitForFunction(
            () =>
                Array.from(document.images)
                    .filter(image => image.getClientRects().length > 0)
                    .every(image => image.complete),
            undefined,
            {
                timeout: 15_000,
            },
        )
        .catch(() => undefined);
    return page.evaluate(() =>
        Array.from(document.images)
            // Only what the reader can actually see is judged, and that is not a detail: the docs
            // site switches its dark and light picture pairs with `display: none`
            // (`docs/blong/src/css/custom.css`), and a browser does not fetch a `loading="lazy"`
            // image that never becomes visible — so a theme-hidden image is legitimately
            // `complete === false` forever. Counting it would report the site's own theming as a
            // defect, which is the wrong lesson to teach a reader of a failing check.
            .filter(image => image.getClientRects().length > 0)
            .filter(image => !(image.complete && image.naturalWidth > 0))
            .map(image => image.getAttribute('src') ?? '(no src)'),
    );
}

/** `blong-dev docs <verb> [...]` */
export async function docs(args: string[]): Promise<void> {
    const [verb, ...rest] = args;
    // Resolve from the invoking directory so the command works from a package as well as from the
    // repository root (Rush runs a package's scripts with the package as the working directory).
    const root = repoRoot(process.cwd());
    switch (verb) {
        case 'list':
            list(root, rest);
            break;
        case 'generate':
            generate(root, rest);
            break;
        case 'check':
            check(root, rest);
            break;
        case 'verify':
            await verify(root, rest);
            break;
        case undefined:
        case '--help':
        case '-h':
        case 'help':
            process.stdout.write(
                'Usage:\n' +
                    '  blong-dev docs list [--json]\n' +
                    '  blong-dev docs generate [--only <id[,id]>] [--filter <glob>] [--dry-run]\n' +
                    '  blong-dev docs check    [--only <id[,id]>] [--filter <glob>]\n' +
                    '  blong-dev docs verify   [--base <url>] [--filter <glob>] [--json]\n' +
                    `\nRegister: ${MANIFEST}\n`,
            );
            break;
        default:
            process.stderr.write(`blong-dev docs: unknown verb "${verb}"\n`);
            process.exit(1);
    }
}
