/**
 * The interactive diagrams the documentation site publishes, and the pages that embed them.
 *
 * A docs page can show a diagram instead of a picture of one: `<ArchifyDiagram slug="…" />` frames
 * `static/diagrams/<slug>.html`, which Docusaurus serves verbatim at `/diagrams/<slug>.html` in dev,
 * in a build and in a deploy — the same same-origin arrangement the Storybooks use
 * (`storybookSites.ts`). `docs/blong/diagrams.json` says which diagrams exist; this module is the
 * reader of that register, and it does two things with it, both behind `blong-dev docs diagram`:
 *
 * - **Renders and stages.** Each entry's authored candidate is finalized by the Archify CLI into a
 *   single self-contained HTML file under `static/diagrams/`. The rendered file is not committed:
 *   it is a build output of about a megabyte per diagram, and it comes from a tool the repository
 *   does not depend on.
 * - **Captures the poster.** A page whose diagram was never staged has to show something, and the
 *   poster is that something: the diagram's own SVG, in both themes, photographed from the rendered
 *   file. It is committed, so the docs build stays free of a rendering step, and it is captured
 *   from the published bytes rather than drawn separately, so it cannot disagree with them.
 *
 * The Archify CLI is not a dependency of this repository — it is a skill the author has installed —
 * so its location is resolved from `ARCHIFY_BIN` (or `--archify`) and a missing one is reported as
 * an instruction rather than as a crash. Why the HTML is staged and the posters are not @@D-731.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import stripJsonComments from 'strip-json-comments';

/** Repository-relative path of the register. */
export const DIAGRAM_MANIFEST = 'docs/blong/diagrams.json';

/**
 * Directory the register's own paths are relative to.
 *
 * A maintainer reads this file beside the trees it names (`draw/archify/…`, `static/diagrams/…`),
 * so the paths are written from here and converted on load.
 */
const DIAGRAM_PACKAGE = 'docs/blong';

/** Where the Archify evidence and receipts of a run are kept; gitignored, like every `dev/` tree. */
const EVIDENCE_ROOT = 'dev/archify';

/**
 * A fresh directory for one run's receipts.
 *
 * The renderer refuses to write a browser receipt over evidence that another artifact produced, and
 * it is right to: a receipt describes one exact output. A re-render of an edited candidate therefore
 * needs its own folder, and a numbered sibling keeps the previous run's diagnosis readable instead
 * of deleting it.
 */
function evidenceDir(root: string, slug: string): string {
    const base = join(root, EVIDENCE_ROOT, slug);
    let candidate = base;
    let run = 2;
    while (existsSync(candidate)) {
        candidate = `${base}-${run}`;
        run++;
    }
    return candidate;
}

/** One published diagram. */
export interface IPublishedDiagram {
    /** Identifier the register keys on, the embed's `slug`, and the staged file's name. */
    slug: string;
    /** What the diagram is, for the summary and the index page. */
    title: string;
    /** Archify diagram type, passed to `finalize`. */
    type: string;
    /** Repository-relative path of the authored candidate. */
    candidate: string;
    /** Repository-relative path the rendered HTML is written to. */
    output: string;
    /** Repository-relative path of the committed poster, per theme. */
    poster: {light: string; dark: string};
    /** Default frame height an embed uses, a CSS length. */
    height: string;
    /** Repository-relative path of the page that embeds it. */
    page: string;
}

/** The themes a poster is captured in, in the order the two files are written. */
export const POSTER_THEMES = ['light', 'dark'] as const;

/** Join a register path onto the tree it is relative to. */
function resolveUnder(root: string, path: string): string {
    return join(root, DIAGRAM_PACKAGE, path);
}

/** Read and validate the register, keyed by slug and in a stable order. */
export function loadDiagrams(root: string): IPublishedDiagram[] {
    const file = join(root, DIAGRAM_MANIFEST);
    if (!existsSync(file)) {
        process.stderr.write(`blong-dev docs: no diagram register at ${DIAGRAM_MANIFEST}\n`);
        process.exit(1);
    }
    let parsed: unknown;
    try {
        // JSONC, like the artefact and Storybook registers, so a maintainer can comment an entry
        // out while investigating it.
        parsed = JSON.parse(stripJsonComments(readFileSync(file, 'utf8')));
    } catch (error) {
        process.stderr.write(
            `blong-dev docs: ${DIAGRAM_MANIFEST} is not valid JSON — ${(error as Error).message}\n`,
        );
        process.exit(1);
    }
    const diagrams = (parsed as {diagrams?: unknown}).diagrams;
    if (typeof diagrams !== 'object' || diagrams === null || Array.isArray(diagrams)) {
        process.stderr.write(`blong-dev docs: ${DIAGRAM_MANIFEST} has no "diagrams" object\n`);
        process.exit(1);
    }
    return Object.entries(diagrams as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, entry]) => validateDiagram(root, slug, entry));
}

/** Reject a malformed entry with enough context to fix it without opening this file. */
function validateDiagram(root: string, slug: string, entry: unknown): IPublishedDiagram {
    const fail = (problem: string): never => {
        process.stderr.write(`blong-dev docs: ${DIAGRAM_MANIFEST} ${slug}: ${problem}\n`);
        process.exit(1);
    };
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
        fail(
            'the key must be a lowercase file name (it becomes the staged file and the embed slug)',
        );
    }
    if (typeof entry !== 'object' || entry === null) fail('not an object');
    const record = entry as Record<string, unknown>;
    const text = (key: string): string =>
        typeof record[key] === 'string' && record[key] !== ''
            ? (record[key] as string)
            : fail(`"${key}" is missing or not a non-empty string`);
    const poster = record['poster'];
    if (typeof poster !== 'object' || poster === null) fail('"poster" is missing');
    const themes = poster as Record<string, unknown>;
    const path = (key: string): string =>
        typeof themes[key] === 'string' && themes[key] !== ''
            ? resolveUnder(root, themes[key] as string)
            : fail(`"poster.${key}" is missing or not a non-empty string`);
    const output = resolveUnder(root, text('output'));
    if (!output.endsWith('.html')) fail('"output" must name a .html file');
    return {
        slug,
        title: text('title'),
        type: text('type'),
        candidate: resolveUnder(root, text('candidate')),
        output,
        poster: {light: path('light'), dark: path('dark')},
        height: text('height'),
        page: resolveUnder(root, text('page')),
    };
}

/**
 * Where an installed Archify CLI may be, in the order the command looks.
 *
 * The tool is `private: true` in its own repository and the name `archify` on npm belongs to an
 * unrelated package, so it cannot be a registry dependency: it is installed either as a git
 * dependency of this docs package, or as the skill of an installed agent. Both are searched, which
 * is what keeps `ARCHIFY_BIN` an override for an unusual layout rather than a requirement.
 */
export function archifyCandidates(root: string, env: NodeJS.ProcessEnv): string[] {
    const home = env['HOME'] ?? '';
    const skill = (base: string): string => join(base, 'archify/bin/archify.mjs');
    return [
        // A git dependency of the docs package (`npm run stage-diagrams` resolves it too).
        join(root, DIAGRAM_PACKAGE, 'node_modules/archify/bin/archify.mjs'),
        // The agent skills a developer machine carries.
        skill(join(home, '.agents/skills')),
        skill(join(home, '.claude/skills')),
        skill(join(home, '.codex/skills')),
        skill(join(env['XDG_CONFIG_HOME'] ?? join(home, '.config'), 'agents/skills')),
    ].filter(path => path !== '');
}

/**
 * The Archify CLI to run, or `undefined` when there is none.
 *
 * `--archify` wins over `ARCHIFY_BIN`, which wins over the installed copies — an explicit path is
 * always about a copy the caller is testing.
 */
export function resolveArchify(
    root: string,
    flag: string | undefined,
    env: NodeJS.ProcessEnv,
): string | undefined {
    const explicit = [flag, env['ARCHIFY_BIN']].filter(
        (candidate): candidate is string => candidate !== undefined && candidate !== '',
    );
    return [...explicit, ...archifyCandidates(root, env)].find(path => existsSync(path));
}

/**
 * The environment a render runs in, with a browser the renderer can actually start.
 *
 * Two variables were the whole setup cost. `ARCHIFY_CHROME` is set from the Chromium this package
 * already depends on — `docs verify` drives the same browser — so a machine that ran
 * `npm run ci-docs` once has a renderer that starts. `ARCHIFY_CHROME_NO_SANDBOX` is set unless the
 * caller asks for the sandbox, because the renderer's subject is a local file this repository
 * generated and no network content is loaded into it; on a machine whose kernel refuses
 * unprivileged user namespaces, which is most current distributions, Chrome exits on the sandbox
 * before it reads anything @@D-732.
 */
export async function rendererEnvironment(
    options: {sandbox?: boolean} = {},
): Promise<NodeJS.ProcessEnv> {
    const environment: NodeJS.ProcessEnv = {...process.env};
    const configured = environment['ARCHIFY_CHROME'];
    if (configured === undefined || configured === '') {
        const executable = await chromiumExecutable();
        if (executable !== undefined) environment['ARCHIFY_CHROME'] = executable;
    }
    if (options.sandbox !== true && environment['ARCHIFY_CHROME_NO_SANDBOX'] === undefined) {
        environment['ARCHIFY_CHROME_NO_SANDBOX'] = '1';
    }
    return environment;
}

/**
 * The Chromium Playwright installed, if any.
 *
 * Imported lazily: the package depends on `@playwright/test` for `docs verify`, and a caller that
 * only reads the register should not pay for loading it.
 */
async function chromiumExecutable(): Promise<string | undefined> {
    try {
        const {chromium} = await import('@playwright/test');
        const installed = chromium.executablePath();
        return existsSync(installed) ? installed : undefined;
    } catch {
        return undefined;
    }
}

/** What one `finalize` run reported, reduced to what the summary prints. */
export interface IRenderResult {
    slug: string;
    ok: boolean;
    /** Gate name to its outcome, as Archify reported them. */
    gates: Record<string, string>;
    /** One line of Archify's own diagnosis, when a gate failed. */
    problem?: string;
}

/**
 * Render one diagram, and return what the gates said.
 *
 * The candidate and the output are absolute because the CLI resolves a relative path from its own
 * working directory, and the output is passed in full rather than left to the candidate's
 * `meta.output`: the register is the one place that decides where a rendered diagram lands.
 */
export function renderDiagram(
    root: string,
    diagram: IPublishedDiagram,
    archify: string,
    options: {dryRun?: boolean; environment?: NodeJS.ProcessEnv} = {},
): IRenderResult {
    const evidence = evidenceDir(root, diagram.slug);
    const args = [
        archify,
        'finalize',
        diagram.type,
        diagram.candidate,
        diagram.output,
        '--quality',
        'showcase',
        '--json',
        '--out-dir',
        evidence,
    ];
    if (options.dryRun) {
        process.stdout.write(`would render ${diagram.slug}: node ${args.join(' ')}\n`);
        return {slug: diagram.slug, ok: true, gates: {}};
    }
    mkdirSync(dirname(diagram.output), {recursive: true});
    const run = spawnSync(process.execPath, args, {
        cwd: root,
        encoding: 'utf8',
        env: options.environment ?? process.env,
    });
    const stdout = run.stdout ?? '';
    let receipt: {ok?: boolean; gates?: Record<string, string>; diagnostics?: unknown[]} = {};
    try {
        receipt = JSON.parse(stdout) as typeof receipt;
    } catch {
        // A crash writes its reason outside the JSON receipt, so the whole output is the evidence.
        return {
            slug: diagram.slug,
            ok: false,
            gates: {},
            problem: (run.stderr ?? '').trim() || stdout.trim() || 'the CLI printed nothing',
        };
    }
    const first = Array.isArray(receipt.diagnostics) ? receipt.diagnostics[0] : undefined;
    const problem =
        first === undefined
            ? undefined
            : ((first as {message?: string}).message ?? JSON.stringify(first));
    return {
        slug: diagram.slug,
        ok: receipt.ok === true,
        gates: receipt.gates ?? {},
        problem: receipt.ok === true ? undefined : problem,
    };
}

/** The browser a poster is captured in, injected so the command can be tested without one. */
export interface IPosterBrowser {
    capture(url: string, theme: 'light' | 'dark'): Promise<Buffer>;
    close(): Promise<void>;
}

/**
 * Capture both posters of one rendered diagram.
 *
 * The picture is the diagram's own `<svg role="img">` rather than the page: the viewer's toolbar,
 * cards and node index are interactions, and a poster that showed them would look like a broken
 * page. Motion is frozen first — the viewer animates the diagram's edges on load, and a screenshot
 * taken mid-trace shows edges that are drawn halfway.
 */
export async function capturePosters(
    diagram: IPublishedDiagram,
    browser: IPosterBrowser,
): Promise<void> {
    if (!existsSync(diagram.output)) {
        throw new Error(`${relative(process.cwd(), diagram.output)} was not rendered`);
    }
    const url = pathToFileURL(diagram.output).href;
    for (const theme of POSTER_THEMES) {
        const png = await browser.capture(url, theme);
        mkdirSync(dirname(diagram.poster[theme]), {recursive: true});
        writeFileSync(diagram.poster[theme], png);
    }
}

/**
 * A headless Chromium that photographs the diagram.
 *
 * Playwright is already a dependency of this package (`docs verify` drives the same browser), so
 * this is imported lazily: a `blong-dev docs list` should not pay for loading it.
 *
 * The picture is the viewer's diagram container rather than the `<svg>`: the cards, the zoom
 * controls and the nav HUD are rendered inside the same SVG, and on top of it, so the element's own
 * box includes furniture a poster should not carry. Hiding that furniture first is what makes the
 * container's box the drawing, and it is the only measurement that holds for every diagram type —
 * a workflow draws its nodes differently from an architecture, and a union of node boxes cropped
 * one of them at the edges.
 */
export async function chromiumPosterBrowser(): Promise<IPosterBrowser> {
    const {chromium} = await import('@playwright/test');
    const browser = await chromium.launch().catch((error: Error) => {
        throw new Error(
            `cannot launch chromium (${error.message}). Run \`npx playwright install chromium\`.`,
        );
    });
    return {
        async capture(url, theme) {
            const context = await browser.newContext({
                colorScheme: theme,
                // 0.75 rather than 2: the diagram's drawing is about 1600 CSS px wide, and at twice
                // that the browser painted a blank panel on first load — the decode of a 3200px PNG
                // finished after the paint and nothing scheduled another one. A poster is shown at
                // 600 to 900 px, so ~1200 px is sharp enough and arrives in time.
                deviceScaleFactor: 0.75,
                viewport: {width: 1680, height: 1400},
            });
            try {
                const page = await context.newPage();
                await page.goto(url);
                await page.evaluate(() =>
                    document.documentElement.setAttribute('data-motion', 'still'),
                );
                await page.addStyleTag({
                    content:
                        '.cards,.toolbar,.diagram-nav,.route-journey-controls,[class*="legend"]' +
                        '{display:none!important}',
                });
                const drawing = page.locator('.diagram-container').first();
                await drawing.waitFor({state: 'visible'});
                return await drawing.screenshot({animations: 'disabled'});
            } finally {
                await context.close();
            }
        },
        async close() {
            await browser.close();
        },
    };
}
