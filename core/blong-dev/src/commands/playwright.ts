import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import {basename, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTool, type RunOptions} from '../utils/runTool.ts';

const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));
const PATH_SEP = process.platform === 'win32' ? ';' : ':';

/**
 * Run Playwright tests in the current working directory.
 *
 * Resolves the Playwright CLI from the package's own node_modules first,
 * then falls back to blong-dev's bundled binary.
 *
 * After tests complete, if `allure-results/` exists, automatically
 * generates a single-file Allure HTML report at `allure-report/`.
 */
export async function playwright(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const localBin = join(cwd, 'node_modules', '.bin');
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [localBin, blongDevBin, process.env['PATH'] ?? ''].join(PATH_SEP),
    };
    const run = (cmd: string, runArgs: string[]) =>
        runTool(cmd, runArgs, {cwd, env} satisfies RunOptions);

    // In CI, install browsers using the package's own Playwright version
    if (process.env.CI) {
        await run('playwright', ['install', '--with-deps']);
    }

    // Clear stale results from previous runs
    const resultsDir = join(cwd, 'allure-results');
    rmSync(resultsDir, {recursive: true, force: true});

    const exitCode = await run('playwright', ['test', ...args]);

    // Generate single-file Allure report from results if present
    if (existsSync(resultsDir)) {
        // Move trace zips out before generating the single-file report to avoid
        // embedding them (they're too large and can't be opened via trace.playwright.dev when inlined).
        const reportDir = join(cwd, 'allure-report');
        const tracesDir = join(reportDir, 'traces');
        const traceFiles = readdirSync(resultsDir).filter(f => f.endsWith('-attachment.zip'));
        if (traceFiles.length > 0) {
            mkdirSync(tracesDir, {recursive: true});
            for (const file of traceFiles) {
                renameSync(join(resultsDir, file), join(tracesDir, file));
            }
        }

        console.log('Generating Allure report from allure-results/ ...');
        await run('allure', ['awesome', '--single-file', '-o', 'allure-report', 'allure-results']);

        // Generate summary.md with test results and trace links
        writeSummary(cwd, resultsDir, reportDir, traceFiles);
    }

    process.exitCode = exitCode;
}

interface AllureResult {
    name?: string;
    fullName?: string;
    status?: string;
    labels?: Array<{name: string; value: string}>;
    steps?: Array<{attachments?: Array<{source?: string; type?: string}>}>;
}

function writeSummary(
    cwd: string,
    resultsDir: string,
    reportDir: string,
    traceFiles: string[],
): void {
    const results: Array<{name: string; suite: string; status: string; trace?: string}> = [];
    const traceSet = new Set(traceFiles);

    for (const file of readdirSync(resultsDir).filter(f => f.endsWith('-result.json'))) {
        const data = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as AllureResult;
        const suite = data.labels?.find(l => l.name === 'suite')?.value ?? '';
        const subSuite = data.labels?.find(l => l.name === 'subSuite')?.value ?? '';
        const name = data.name ?? data.fullName ?? file;
        const status = data.status ?? 'unknown';

        // Find trace attachment in steps
        let trace: string | undefined;
        for (const step of data.steps ?? []) {
            for (const att of step.attachments ?? []) {
                if (
                    att.type === 'application/vnd.allure.playwright-trace' &&
                    att.source &&
                    traceSet.has(att.source)
                ) {
                    trace = att.source;
                }
            }
        }

        results.push({name, suite: subSuite ? `${suite} › ${subSuite}` : suite, status, trace});
    }

    // Sort: failures first, then by suite/name
    results.sort((a, b) => {
        if (a.status !== b.status) {
            if (a.status === 'failed' || a.status === 'broken') return -1;
            if (b.status === 'failed' || b.status === 'broken') return 1;
        }
        return (a.suite + a.name).localeCompare(b.suite + b.name);
    });

    const pkg = basename(cwd);
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'broken').length;
    const statusIcon = failed > 0 ? '❌' : '✅';
    const tracesPath = relative(process.env.GITHUB_WORKSPACE ?? cwd, join(reportDir, 'traces'));

    const lines: string[] = [
        `### ${statusIcon} ${pkg} — ${passed} passed, ${failed} failed (${results.length} total)`,
        '',
    ];

    if (failed > 0) {
        lines.push('| Status | Suite | Test | Trace |', '| --- | --- | --- | --- |');
        for (const r of results.filter(r => r.status === 'failed' || r.status === 'broken')) {
            const traceLink = r.trace ? `\`${tracesPath}/${r.trace}\`` : '—';
            lines.push(`| 🔴 | ${r.suite} | ${r.name} | ${traceLink} |`);
        }
        lines.push('');
        if (traceFiles.length > 0) {
            lines.push(
                '> **Traces**: Download the `playwright-traces` artifact and open `.zip` files at ' +
                    '[trace.playwright.dev](https://trace.playwright.dev/)',
                '',
            );
        }
    }

    lines.push(
        `<details><summary>All tests</summary>`,
        '',
        '| Status | Suite | Test |',
        '| --- | --- | --- |',
    );
    for (const r of results) {
        const icon =
            r.status === 'passed'
                ? '🟢'
                : r.status === 'failed' || r.status === 'broken'
                  ? '🔴'
                  : '🟡';
        lines.push(`| ${icon} | ${r.suite} | ${r.name} |`);
    }
    lines.push('', '</details>', '');

    writeFileSync(join(reportDir, 'summary.md'), lines.join('\n'));
}
