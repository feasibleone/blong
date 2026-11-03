/**
 * What a Playwright test pays before it can act, measured rather than assumed.
 *
 * Every spec begins by loading the app in a fresh browser context and logging in, and
 * that boot is the largest single cost of a run: with the dev server warm it is about
 * half a second per test locally, and a CI runner pays more, cold, on a slower CPU. The
 * costs are not obvious from outside — how many modules a fresh context fetches, whether
 * the app booted twice, whether collecting a trace changes any of it — so this module
 * times the phases on the same milestones the `portal` fixture waits for, and reports
 * them in one line per sample.
 *
 * It measures with a browser supplied by Playwright (`browser.newContext()`), not the
 * `page` fixture: the fixture's `page` already boots and logs in, which is the thing
 * being timed.
 *
 * `serveBuiltApp` is the other half of the comparison: it builds the package and serves
 * the build with `vite preview`, so a measurement can put the dev server and a bundled
 * app side by side. `@@T-605`
 */
import type {Browser} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {BLONG_BOOT_TIMEOUT, BLONG_ELEMENT_TIMEOUT} from '../playwright.js';

/** One boot, from `goto` to the composed portal. */
export interface IBootSample {
    /** What this sample measures — `dev #1`, `build + trace`, … */
    label: string;
    /** Document navigations the boot cost. More than one is a reload, not a boot. */
    documents: number;
    /** Script requests, which is the module graph a fresh context has to fetch. */
    scripts: number;
    /** `page.goto()` resolving. */
    gotoMs: number;
    /** The login form becoming visible — the milestone that says the app is up. */
    bootMs: number;
    /** Filling the form and submitting it. */
    submitMs: number;
    /** The portal menubar appearing. */
    menubarMs: number;
    /** The composed menu and brand landing (`html[data-portal-config="merged"]`). */
    mergedMs: number;
    /** Everything above, from the start of the navigation. */
    totalMs: number;
}

/** How to measure one boot. */
export interface IMeasureBootOptions {
    /** What to call the sample in the report. */
    label: string;
    /** The page to open — the app's base URL, e.g. `http://localhost:5173/s/`. */
    url: string;
    /** Login name. */
    username: string;
    /** Login password. */
    password: string;
    /**
     * Start a trace before the first navigation.
     *
     * CI keeps a trace only for a failure (`retain-on-failure`), so the question "does
     * collecting one cost anything" is answered by a sample that asks for it — the
     * screenshots and snapshots a trace captures are the difference.
     */
    trace?: boolean;
    /** Budget for the app to appear (default {@link BLONG_BOOT_TIMEOUT}). */
    bootTimeout?: number;
    /** Budget for an element once the app is up (default {@link BLONG_ELEMENT_TIMEOUT}). */
    elementTimeout?: number;
}

/** The selectors the `portal` fixture logs in through. */
const LOGIN_FIELD = 'input[name="username"]';
const PASSWORD_FIELD = 'input[name="password"]';
const LOGIN_SUBMIT = 'login-submit';
const MENUBAR = '.blong-portal-menubar';
const MERGED = 'html[data-portal-config="merged"]';

/**
 * Boot the app in a fresh context and time each phase.
 *
 * The context is closed before returning, trace included: a sample must not leave a
 * browser behind, and the caller usually wants several.
 */
export async function measureBoot(
    browser: Browser,
    options: IMeasureBootOptions,
): Promise<IBootSample> {
    const {
        label,
        url,
        username,
        password,
        trace = false,
        bootTimeout = BLONG_BOOT_TIMEOUT,
        elementTimeout = BLONG_ELEMENT_TIMEOUT,
    } = options;
    const context = await browser.newContext();
    let documents = 0;
    let scripts = 0;
    try {
        if (trace) await context.tracing.start({screenshots: true, snapshots: true});
        const page = await context.newPage();
        page.on('request', request => {
            const type = request.resourceType();
            if (type === 'document') documents += 1;
            else if (type === 'script') scripts += 1;
        });

        const started = Date.now();
        await page.goto(url);
        const gotoMs = Date.now() - started;

        await page.locator(LOGIN_FIELD).waitFor({state: 'visible', timeout: bootTimeout});
        const bootMs = Date.now() - started - gotoMs;

        const submitted = Date.now();
        await page.fill(LOGIN_FIELD, username, {timeout: elementTimeout});
        await page.fill(PASSWORD_FIELD, password, {timeout: elementTimeout});
        await page.getByTestId(LOGIN_SUBMIT).click({timeout: elementTimeout});
        const submitMs = Date.now() - submitted;

        const menubarAt = Date.now();
        await page.locator(MENUBAR).waitFor({state: 'visible', timeout: elementTimeout});
        const menubarMs = Date.now() - menubarAt;

        const mergedAt = Date.now();
        await page.locator(MERGED).waitFor({state: 'attached', timeout: elementTimeout});
        const mergedMs = Date.now() - mergedAt;

        return {
            label,
            documents,
            scripts,
            gotoMs,
            bootMs,
            submitMs,
            menubarMs,
            mergedMs,
            totalMs: Date.now() - started,
        };
    } finally {
        await context.close();
    }
}

/** Options for {@link reportLatency}. */
export interface ILatencyReportOptions {
    /** Where to write the samples, as JSON. */
    file?: string;
}

/** One column of the table, as a header and a value. */
const COLUMNS: Array<{header: string; value: (sample: IBootSample) => number}> = [
    {header: 'total', value: sample => sample.totalMs},
    {header: 'goto', value: sample => sample.gotoMs},
    {header: 'boot', value: sample => sample.bootMs},
    {header: 'submit', value: sample => sample.submitMs},
    {header: 'menubar', value: sample => sample.menubarMs},
    {header: 'merged', value: sample => sample.mergedMs},
    {header: 'docs', value: sample => sample.documents},
    {header: 'scripts', value: sample => sample.scripts},
];

const LABEL_WIDTH = 16;
const COLUMN_WIDTH = 8;

/**
 * The samples as a fixed-width table, one row each.
 *
 * Fixed-width on purpose: the numbers are read next to the previous run's, and a table
 * that re-flows is compared by eye and reported as a change. `ms` is in the header
 * rather than on every cell for the same reason.
 */
export function latencyTable(samples: readonly IBootSample[]): string {
    const header = [
        'sample'.padEnd(LABEL_WIDTH),
        ...COLUMNS.map(column => column.header.padStart(COLUMN_WIDTH)),
    ];
    const rows = samples.map(sample => [
        sample.label.padEnd(LABEL_WIDTH),
        ...COLUMNS.map(column => String(column.value(sample)).padStart(COLUMN_WIDTH)),
    ]);
    return (
        [header.join(''), ...rows.map(row => row.join(''))].join('\n') +
        '\n(ms, except docs/scripts)'
    );
}

/** The median of a list, or `0` for an empty one. */
function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? (sorted[middle] as number)
        : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/**
 * One line per leg: the median of its samples.
 *
 * A single boot on a shared machine is noisy — a dev server re-optimising a dependency
 * mid-leg doubles the number — so the medians are what a reader compares, and the table
 * above them says how wide the spread was. A leg is identified by its label without the
 * run number (`dev #3` is `dev`), which is why the labels end in one.
 */
export function latencySummary(samples: readonly IBootSample[]): string {
    const legs = new Map<string, number[]>();
    for (const sample of samples) {
        const leg = sample.label.replace(/\s*#\d+$/, '');
        legs.set(leg, [...(legs.get(leg) ?? []), sample.totalMs]);
    }
    const parts = [...legs].map(([leg, totals]) => `${leg} ${median(totals)}`);
    return `median total (ms): ${parts.join(' · ')}`;
}

/**
 * The samples as a table, plus the same samples as JSON beside it.
 *
 * Returns the table so the caller decides where it is logged: a spec prints it to the
 * run's output and adds it to the test's annotations, which is what the CI report
 * carries.
 */
export function reportLatency(
    samples: readonly IBootSample[],
    options: ILatencyReportOptions = {},
): string {
    const table = latencyTable(samples);
    if (options.file) {
        const file = resolve(options.file);
        mkdirSync(dirname(file), {recursive: true});
        writeFileSync(
            file,
            `${JSON.stringify({at: new Date().toISOString(), samples}, null, 2)}\n`,
        );
    }
    return table;
}

/** How to build and serve a package for a measurement. */
export interface IServeBuiltAppOptions {
    /** The package to build — its own `vite.config.ts` applies. */
    packageDir: string;
    /** Where the build goes (default `.playwright/latency-dist` inside the package). */
    outDir?: string;
    /**
     * Origin the build's `/rpc` calls are proxied to.
     *
     * Defaults to `http://localhost:8080`, which is the gateway a local run uses. A run
     * whose backend sits elsewhere — a CI port pair, or the dev server that is already
     * proxying — passes its own, because the preview server proxies `/rpc` the same way
     * the dev server does (`preview.proxy` in `vite.ts`).
     */
    rpcOrigin?: string;
    /** Budget for the build, then for the server to answer (default 180 s, then 30 s). */
    buildTimeoutMs?: number;
    serverTimeoutMs?: number;
}

/** A build served from disk, ready to be measured. */
export interface IBuiltApp {
    /** The app's base URL, as the server printed it, e.g. `http://localhost:42429/s/`. */
    url: string;
    /** The build's directory. */
    outDir: string;
    /** Stop the server. Always call it: a leaked preview holds its port. */
    stop: () => Promise<void>;
}

/**
 * Build the package and serve it with `vite preview`.
 *
 * Compression is switched off for the build (`BLONG_SKIP_COMPRESSION`): a `.gz` sibling is
 * a publish artifact no browser reads, and it is 92% of the build's time — a measurement
 * that waited for it would spend half a minute timing nothing.
 *
 * The server picks its own free port (`--port 0`) and this reads the URL it prints, rather
 * than deriving one: CI hands every package a unique pair derived from its index, so any
 * port arithmetic here would collide with another package's the moment one was added.
 */
export async function serveBuiltApp(options: IServeBuiltAppOptions): Promise<IBuiltApp> {
    const {
        packageDir,
        outDir = join(packageDir, '.playwright', 'latency-dist'),
        rpcOrigin = 'http://localhost:8080',
        buildTimeoutMs = 180_000,
        serverTimeoutMs = 30_000,
    } = options;
    const vite = viteCli(packageDir);
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        BLONG_SKIP_COMPRESSION: '1',
        // `rpcTarget` in `vite.ts` is built from this port.
        PLAYWRIGHT_BACKEND_PORT: String(new URL(rpcOrigin).port || 80),
    };

    await run(
        process.execPath,
        [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'],
        {cwd: packageDir, env, timeoutMs: buildTimeoutMs, what: 'build'},
    );

    const server = spawn(
        process.execPath,
        [vite, 'preview', '--outDir', outDir, '--port', '0', '--logLevel', 'info'],
        {cwd: packageDir, env, stdio: ['ignore', 'pipe', 'pipe']},
    );
    const stop = async () => {
        if (server.exitCode !== null || server.signalCode !== null) return;
        server.kill('SIGTERM');
        await new Promise<void>(settle => server.once('exit', () => settle()));
    };

    let printed = '';
    const collect = (chunk: Buffer) => {
        // Vite colourises the URL it prints, and the escapes sit between the digits of
        // the port: matching the raw text finds no URL and the wait times out on a server
        // that was ready in 89 ms.
        printed += chunk.toString().replace(/\u001b\[[0-9;]*m/g, '');
    };
    server.stdout.on('data', collect);
    server.stderr.on('data', collect);

    try {
        const url = await waitForUrl(server, () => printed, serverTimeoutMs);
        return {url, outDir, stop};
    } catch (error) {
        await stop();
        throw error;
    }
}

/**
 * The package's own Vite CLI.
 *
 * Resolved through `vite`'s manifest rather than by path: `vite/bin/vite.js` is not an
 * exported subpath, so `require.resolve` refuses it, while the manifest names the file.
 * The package's copy, not this module's — an app builds with the Vite it declares.
 */
function viteCli(packageDir: string): string {
    const manifest = createRequire(join(packageDir, 'package.json')).resolve('vite/package.json');
    const {bin} = JSON.parse(readFileSync(manifest, 'utf8')) as {bin: Record<string, string>};
    return join(dirname(manifest), bin['vite'] as string);
}

/** Run a child to completion, failing with what it printed. */ async function run(
    command: string,
    args: string[],
    options: {cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; what: string},
): Promise<void> {
    const {cwd, env, timeoutMs, what} = options;
    await new Promise<void>((settle, fail) => {
        const child = spawn(command, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
        let output = '';
        const collect = (chunk: Buffer) => {
            output += chunk.toString();
            if (output.length > 20_000) output = output.slice(-20_000);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            fail(new Error(`${what} exceeded ${timeoutMs} ms\n${output}`));
        }, timeoutMs);
        child.once('error', error => {
            clearTimeout(timer);
            fail(error);
        });
        child.once('exit', code => {
            clearTimeout(timer);
            if (code === 0) settle();
            else fail(new Error(`${what} exited with ${code}\n${output}`));
        });
    });
}

/**
 * Poll until the preview server answers, and report what it printed instead when it does.
 *
 * The URL is the one the server printed (`--port 0`), so a server that never printed one
 * has failed rather than being slow.
 */
async function waitForUrl(
    server: {exitCode: number | null},
    printed: () => string,
    timeoutMs: number,
): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = 'no URL printed';
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`preview exited with ${server.exitCode}\n${printed()}`);
        }
        const url = /http:\/\/localhost:\d+\/\S*/.exec(printed())?.[0];
        if (url) {
            try {
                const response = await fetch(url);
                if (response.ok) return url;
                last = `HTTP ${response.status} from ${url}`;
            } catch (error) {
                last = `${String(error)} from ${url}`;
            }
        }
        await new Promise(settle => setTimeout(settle, 250));
    }
    throw new Error(`preview did not answer within ${timeoutMs} ms (${last})\n${printed()}`);
}
