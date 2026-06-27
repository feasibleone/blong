import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import {basename, join} from 'node:path';
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
 *
 * When `--coverage` is passed (stripped from Playwright args):
 * - Sets NODE_V8_COVERAGE to collect server-side V8 coverage from web server processes
 * - After tests complete, runs c8 report on the collected coverage data
 * - Coverage output lands in `coverage/` at the repository root
 */
export async function playwright(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const localBin = join(cwd, 'node_modules', '.bin');

    // Check for --coverage flag and strip it from Playwright args
    const collectCoverage = args.includes('--coverage');
    const pwArgs = args.filter(a => a !== '--coverage');

    const coverageDir = join(cwd, '.playwright', 'coverage');
    const v8Dir = join(coverageDir, 'v8');

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [localBin, blongDevBin, process.env['PATH'] ?? ''].join(PATH_SEP),
    };

    // When collecting coverage, set NODE_V8_COVERAGE so the blong server process
    // (spawned by Playwright's webServer config) writes V8 coverage on exit.
    if (collectCoverage) {
        mkdirSync(v8Dir, {recursive: true});
        env['NODE_V8_COVERAGE'] = v8Dir;
        console.log(`[playwright --coverage] NODE_V8_COVERAGE=${v8Dir}`);
    }

    const run = (cmd: string, runArgs: string[]) =>
        runTool(cmd, runArgs, {cwd, env} satisfies RunOptions);

    // In CI, ensure browsers and system deps are available.
    // The rush.yaml workflow pre-installs and caches browsers, so this is typically a no-op.
    // Skip when PLAYWRIGHT_SKIP_INSTALL is set to avoid parallel dpkg lock contention.
    if (process.env.CI && !process.env.PLAYWRIGHT_SKIP_INSTALL) {
        await run('playwright', ['install', '--with-deps']);
    }

    // Clear stale results from previous runs
    const resultsDir = join(cwd, 'allure-results');
    rmSync(resultsDir, {recursive: true, force: true});

    const exitCode = await run('playwright', ['test', ...pwArgs]);

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

        // Generate summary.md (for $GITHUB_STEP_SUMMARY) and index.html (for GitHub Pages)
        const parsed = parseResults(resultsDir, traceFiles);
        writeSummary(reportDir, parsed, basename(cwd));
        writeIndexHtml(reportDir, parsed, basename(cwd));
    }

    // ── Coverage collection ──────────────────────────────────────────────────
    // When --coverage was requested, copy V8 coverage files produced by
    // both the server process (via NODE_V8_COVERAGE) and the browser-side
    // coverage fixture into the invoking package's .tap/coverage/ directory.
    // The run-coverage.sh script later copies them into blong-gogo's
    // .tap/coverage/ for the unified c8 aggregation.
    if (collectCoverage && existsSync(v8Dir)) {
        const v8Files = readdirSync(v8Dir).filter(f => f.endsWith('.json'));
        if (v8Files.length > 0) {
            console.log(
                `\n[playwright --coverage] ${v8Files.length} V8 coverage file(s) found in ${v8Dir}`,
            );

            const tapDir = join(cwd, '.tap', 'coverage');
            mkdirSync(tapDir, {recursive: true});

            let copied = 0;
            for (const file of v8Files) {
                const src = join(v8Dir, file);
                const dst = join(tapDir, `pw-${file}`);
                copyFileSync(src, dst);
                copied++;
            }
            console.log(`[playwright --coverage] Copied ${copied} coverage file(s) to ${tapDir}`);
        } else {
            console.log('[playwright --coverage] No V8 coverage files found');
        }
    }

    process.exitCode = exitCode;
}

interface AllureResult {
    name?: string;
    fullName?: string;
    status?: string;
    testCaseId?: string;
    historyId?: string;
    labels?: Array<{name: string; value: string}>;
    steps?: Array<{attachments?: Array<{source?: string; type?: string}>}>;
}

interface TestResult {
    name: string;
    suite: string;
    status: string;
    trace?: string;
}

function parseResults(resultsDir: string, traceFiles: string[]): TestResult[] {
    const traceSet = new Set(traceFiles);

    // Collect all attempts grouped by test identity
    const attempts = new Map<
        string,
        Array<{status: string; name: string; suite: string; trace?: string}>
    >();

    for (const file of readdirSync(resultsDir).filter(f => f.endsWith('-result.json'))) {
        const data = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as AllureResult;
        const suite = data.labels?.find(l => l.name === 'suite')?.value ?? '';
        const subSuite = data.labels?.find(l => l.name === 'subSuite')?.value ?? '';
        const name = data.name ?? data.fullName ?? file;
        const status = data.status ?? 'unknown';
        const key = data.testCaseId ?? data.historyId ?? `${suite}/${subSuite}/${name}`;

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

        const group = attempts.get(key) ?? [];
        group.push({status, name, suite: subSuite ? `${suite} › ${subSuite}` : suite, trace});
        attempts.set(key, group);
    }

    // Deduplicate: a test with both failed and passed attempts is flaky
    const results: TestResult[] = [];
    for (const group of attempts.values()) {
        const hasFailed = group.some(a => a.status === 'failed' || a.status === 'broken');
        const hasPassed = group.some(a => a.status === 'passed');
        const status = hasFailed && hasPassed ? 'flaky' : hasFailed ? 'failed' : group[0]!.status;
        // Use the trace from the failed attempt (most useful for debugging)
        const trace = group.find(a => a.trace)?.trace;
        results.push({name: group[0]!.name, suite: group[0]!.suite, status, trace});
    }

    results.sort((a, b) => {
        const order = (s: string) => (s === 'failed' || s === 'broken' ? 0 : s === 'flaky' ? 1 : 2);
        if (order(a.status) !== order(b.status)) return order(a.status) - order(b.status);
        return (a.suite + a.name).localeCompare(b.suite + b.name);
    });

    return results;
}

function writeSummary(reportDir: string, results: TestResult[], pkg: string): void {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'broken').length;
    const flaky = results.filter(r => r.status === 'flaky').length;
    const statusIcon = failed > 0 ? '❌' : flaky > 0 ? '⚠️' : '✅';
    const hasTraces = results.some(r => r.trace);

    const counts = [`${passed} passed`, `${failed} failed`];
    if (flaky > 0) counts.push(`${flaky} flaky`);

    const lines: string[] = [
        `### ${statusIcon} ${pkg} — ${counts.join(', ')} (${results.length} total)`,
        '',
    ];

    const problems = results.filter(
        r => r.status === 'failed' || r.status === 'broken' || r.status === 'flaky',
    );
    if (problems.length > 0) {
        lines.push('| Status | Suite | Test | Trace |', '| --- | --- | --- | --- |');
        for (const r of problems) {
            const icon = r.status === 'flaky' ? '🟡' : '🔴';
            const traceLink = r.trace ? `\`traces/${r.trace}\`` : '—';
            lines.push(`| ${icon} ${r.status} | ${r.suite} | ${r.name} | ${traceLink} |`);
        }
        lines.push('');
        if (hasTraces) {
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

function writeIndexHtml(reportDir: string, results: TestResult[], pkg: string): void {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'broken').length;
    const flaky = results.filter(r => r.status === 'flaky').length;
    const statusIcon = failed > 0 ? '❌' : flaky > 0 ? '⚠️' : '✅';

    const counts = [`${passed} passed`, `${failed} failed`];
    if (flaky > 0) counts.push(`${flaky} flaky`);

    const testRows = results
        .map(r => {
            const icon =
                r.status === 'passed'
                    ? '🟢'
                    : r.status === 'flaky'
                      ? '🟡'
                      : r.status === 'failed' || r.status === 'broken'
                        ? '🔴'
                        : '⚪';
            const traceCell = r.trace
                ? `<a class="trace-link" data-trace="traces/${r.trace}">Open Trace</a>`
                : '';
            return `<tr class="${r.status}"><td>${icon}</td><td>${esc(r.suite)}</td><td>${esc(r.name)}</td><td>${traceCell}</td></tr>`;
        })
        .join('\n          ');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(pkg)} — Playwright Report</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; }
    a { color: #0969da; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid #d0d7de; }
    th { background: #f6f8fa; font-weight: 600; }
    tr.failed, tr.broken { background: #fff0f0; }
    tr.flaky { background: #fff8e1; }
    .report-link { display: inline-block; margin: 1rem 0; padding: 0.5rem 1rem; background: #0969da; color: #fff; text-decoration: none; border-radius: 6px; }
    .report-link:hover { background: #0550ae; }
    .trace-link { cursor: pointer; text-decoration: underline; }
    @media (prefers-color-scheme: dark) {
      th { background: #161b22; }
      tr.failed, tr.broken { background: #3d1f1f; }
      tr.flaky { background: #3d3520; }
      a { color: #58a6ff; }
      .report-link { background: #1f6feb; }
      .report-link:hover { background: #388bfd; }
    }
  </style>
</head>
<body>
  <h1>${statusIcon} ${esc(pkg)} — ${counts.join(', ')} (${results.length} total)</h1>
  <a class="report-link" href="awesome/index.html">Open Allure Report</a>
  <table>
    <thead><tr><th></th><th>Suite</th><th>Test</th><th>Trace</th></tr></thead>
    <tbody>
      ${testRows}
    </tbody>
  </table>
  <script>
    document.querySelectorAll('.trace-link').forEach(el => {
      el.addEventListener('click', () => {
        const base = location.href.replace(/\\/index\\.html$/, '').replace(/\\/$/, '');
        const traceUrl = base + '/' + el.dataset.trace;
        window.open('https://trace.playwright.dev/?trace=' + encodeURIComponent(traceUrl));
      });
    });
  </script>
</body>
</html>`;

    writeFileSync(join(reportDir, 'index.html'), html);
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
