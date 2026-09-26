/**
 * Builds the single "what failed" bundle that is published for a red run.
 *
 * Layout of `<outDir>/publish/`:
 * - `index.html` — single-file Allure report containing only the failing tests
 * - `failures.json` — the machine readable index a coding agent can read
 * - `failures.md` — the same information for humans (with trace links)
 * - `traces/` — Playwright trace archives referenced from both
 *
 * Allure results come from the packages that produced them (Playwright) and are
 * synthesised for runners that do not (tap, vitest), so one report covers every
 * failure of the run.
 */

import {createHash} from 'node:crypto';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import {basename, dirname, join} from 'node:path';

import type {IFailure} from './aggregate.ts';
import type {IFailureHistory} from './provenance.ts';
import {PUBLISH_DIR, REPORT_DIR} from './reportPaths.ts';
import {hasRun, type IReport, type TestStatus} from './reportTypes.ts';

/** Maximum characters of a failure message inlined into `summary.md`. */
const MAX_SUMMARY_MESSAGE = 1200;

interface IAllureAttachment {
    source?: string;
}

interface IAllureResult {
    status?: string;
    attachments?: IAllureAttachment[];
    steps?: Array<{attachments?: IAllureAttachment[]; steps?: unknown[]}>;
}

export interface IFailuresBundleMeta {
    repository?: string;
    workflow?: string;
    run?: number;
    commit?: string;
    runUrl?: string;
}

export interface IIFailuresBundle {
    /** Directory that gets published (`index.html`, `failures.json`, …). */
    publishDir: string;
    failuresJson: string;
    summaryMd: string;
    count: number;
}

export interface IBuildFailuresOptions {
    root: string;
    outDir: string;
    reports: readonly IReport[];
    failures: readonly IFailure[];
    meta: IFailuresBundleMeta;
    runAllure: (args: string[], cwd: string) => Promise<number>;
}

function shortHash(...parts: string[]): string {
    return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 16);
}

/**
 * Locate the single-file `index.html` Allure produced.
 *
 * Allure writes it directly into the output directory when that directory is
 * empty and into an `awesome/` sub-directory otherwise, so the bundle cannot
 * rely on a fixed path.
 */
function findIndexHtml(dir: string): string | undefined {
    const direct = join(dir, 'index.html');
    if (existsSync(direct)) return direct;
    const nested = join(dir, 'awesome', 'index.html');
    if (existsSync(nested)) return nested;
    for (const entry of existsSync(dir) ? readdirSync(dir, {withFileTypes: true}) : []) {
        if (!entry.isDirectory()) continue;
        const candidate = join(dir, entry.name, 'index.html');
        if (existsSync(candidate)) return candidate;
    }
    return undefined;
}

function collectAttachmentSources(result: IAllureResult): string[] {
    const sources: string[] = [];
    for (const attachment of result.attachments ?? []) {
        if (attachment.source) sources.push(attachment.source);
    }
    for (const step of result.steps ?? []) {
        for (const attachment of step.attachments ?? []) {
            if (attachment.source) sources.push(attachment.source);
        }
    }
    return sources;
}

/** Copy the failing results of one package (plus their attachments) into staging. */
function stagePackageResults(resultsDir: string, staging: string): number {
    if (!existsSync(resultsDir)) return 0;
    const files = readdirSync(resultsDir);
    let staged = 0;

    // Containers group results into fixtures/suites; copy them all (they are tiny).
    for (const file of files) {
        if (file.endsWith('-container.json'))
            copyFileSync(join(resultsDir, file), join(staging, file));
    }

    for (const file of files) {
        if (!file.endsWith('-result.json')) continue;
        let parsed: IAllureResult;
        try {
            parsed = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as IAllureResult;
        } catch {
            continue;
        }
        if (parsed.status !== 'failed' && parsed.status !== 'broken') continue;
        copyFileSync(join(resultsDir, file), join(staging, file));
        staged += 1;
        for (const source of collectAttachmentSources(parsed)) {
            const attachment = join(resultsDir, source);
            if (existsSync(attachment)) copyFileSync(attachment, join(staging, basename(source)));
        }
    }
    return staged;
}

/** Minimal Allure result for a failure reported by a non-Allure runner. */
function syntheticResult(failure: IFailure): Record<string, unknown> {
    const id = shortHash(failure.package, failure.suite, failure.name);
    return {
        uuid: id,
        historyId: id,
        testCaseId: id,
        name: failure.name,
        fullName: `${failure.package} › ${failure.name}`,
        status: 'failed',
        statusDetails: {message: failure.message ?? '', trace: failure.stack ?? ''},
        stage: 'finished',
        start: 0,
        stop: 0,
        labels: [
            {name: 'package', value: failure.package},
            {name: 'suite', value: failure.suite},
            {name: 'runner', value: failure.runner},
            {name: 'blong.status', value: failure.status},
            // Whether the base branch was already red on this test belongs in the
            // published report too: the bundle is what a reviewer opens from the
            // pull request, and the difference between "new" and "recurring" is the
            // first thing they want to know.
            ...(failure.history ? [{name: 'blong.history', value: failure.history.kind}] : []),
        ],
        attachments: [],
        steps: [],
    };
}

function renderFailuresSummary(
    failuresByPackage: Map<string, IFailure[]>,
    meta: IFailuresBundleMeta,
): string {
    const lines: string[] = ['# Failed tests', ''];
    const runText = [
        meta.repository,
        meta.workflow && `workflow ${meta.workflow}`,
        meta.run && `build #${meta.run}`,
    ]
        .filter(Boolean)
        .join(' · ');
    if (runText) lines.push(`_${runText}_`, '');
    if (meta.runUrl) lines.push(`[Full run](${meta.runUrl}) | [Allure report](index.html)`, '');

    const total = [...failuresByPackage.values()].reduce((sum, list) => sum + list.length, 0);
    lines.push(`**${total} failing test(s) in ${failuresByPackage.size} package(s)**`, '');

    for (const [pkg, failures] of failuresByPackage) {
        lines.push(`## ${pkg}`, '');
        for (const failure of failures) {
            const location = failure.file
                ? `${failure.file}${failure.line ? `:${failure.line}` : ''}`
                : '';
            const provenance = failure.history ? ` — \`${failure.history.kind}\`` : '';
            lines.push(
                `- ${failure.status === 'flaky' ? '🟡 flaky' : '🔴 failed'} **${failure.suite} › ${failure.name}**` +
                    `${location ? ` — \`${location}\`` : ''}${provenance}`,
            );
            if (failure.trace) lines.push(`  - trace: \`traces/${failure.trace}\``);
            if (failure.message) {
                const message = failure.message.slice(0, MAX_SUMMARY_MESSAGE).trimEnd();
                lines.push(
                    '',
                    '  ```',
                    ...message.split('\n').map(line => `  ${line}`),
                    '  ```',
                    '',
                );
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}

interface IFailuresJsonPackage {
    package: string;
    path: string;
    /**
     * Every runner that reported into the package, in the order they ran.
     *
     * There is deliberately no singular `runner`: a package can run two (a realm's
     * handler tests and its browser tests), and a reader that picked the first would
     * attribute the package's failures to a leg that did not produce them. Each
     * failure carries its own `runner`.
     */
    runners: string[];
    counts: IReport['counts'];
    failures: Array<{
        suite: string;
        test: string;
        status: TestStatus;
        /** The runner this test failed under, since one package can have several. */
        runner: string;
        /**
         * Where the test stands in the base branch's recent history, when it could be
         * matched there. `new` means main was green on it, which is the field that
         * decides whether this run's failure is this branch's doing.
         */
        history?: IFailureHistory;
        file?: string;
        line?: number;
        message?: string;
        stack?: string;
        trace?: string;
        logTraceId?: string;
    }>;
}

function buildFailuresJson(
    reports: readonly IReport[],
    failuresByPackage: Map<string, IFailure[]>,
    meta: IFailuresBundleMeta,
): string {
    const entries: IFailuresJsonPackage[] = [];
    for (const [pkg, failures] of failuresByPackage) {
        const report = reports.find(candidate => candidate.package === pkg);
        entries.push({
            package: pkg,
            path: report?.path ?? failures[0]?.path ?? '',
            runners: report
                ? report.runs.map(run => run.runner)
                : [...new Set(failures.map(failure => failure.runner))],
            counts: report?.counts ?? {
                total: 0,
                passed: 0,
                failed: 0,
                flaky: 0,
                skipped: 0,
                todo: 0,
            },
            failures: failures.map(failure => ({
                suite: failure.suite,
                test: failure.name,
                status: failure.status,
                runner: failure.runner,
                ...(failure.history ? {history: failure.history} : {}),
                ...(failure.file ? {file: failure.file} : {}),
                ...(failure.line ? {line: failure.line} : {}),
                ...(failure.message ? {message: failure.message} : {}),
                ...(failure.stack ? {stack: failure.stack} : {}),
                ...(failure.trace ? {trace: `traces/${failure.trace}`} : {}),
                ...(failure.logTraceId ? {logTraceId: failure.logTraceId} : {}),
            })),
        });
    }

    const total = entries.reduce((sum, entry) => sum + entry.failures.length, 0);
    return (
        JSON.stringify(
            {
                schema: 1,
                generatedAt: new Date().toISOString(),
                repository: meta.repository ?? '',
                workflow: meta.workflow ?? '',
                run: meta.run ?? 0,
                commit: meta.commit ?? '',
                runUrl: meta.runUrl ?? '',
                totals: {
                    packages: entries.length,
                    tests: total,
                    failed: entries.reduce(
                        (sum, entry) =>
                            sum +
                            entry.failures.filter(failure => failure.status !== 'flaky').length,
                        0,
                    ),
                    flaky: entries.reduce(
                        (sum, entry) =>
                            sum +
                            entry.failures.filter(failure => failure.status === 'flaky').length,
                        0,
                    ),
                    /** Problems the base branch was green on, i.e. what this run introduced. */
                    newFailures: entries.reduce(
                        (sum, entry) =>
                            sum +
                            entry.failures.filter(failure => failure.history?.kind === 'new')
                                .length,
                        0,
                    ),
                },
                allure: 'index.html',
                packages: entries,
            },
            null,
            2,
        ) + '\n'
    );
}

/**
 * Build the failures bundle, or return `null` when the run is green.
 */
export async function buildFailuresBundle(
    options: IBuildFailuresOptions,
): Promise<IIFailuresBundle | null> {
    const {root, outDir, reports, failures, meta, runAllure} = options;
    if (failures.length === 0) return null;

    const staging = join(outDir, '.staging', 'allure-results');
    const publishDir = join(outDir, PUBLISH_DIR);
    rmSync(join(outDir, '.staging'), {recursive: true, force: true});
    rmSync(publishDir, {recursive: true, force: true});
    mkdirSync(staging, {recursive: true});
    mkdirSync(publishDir, {recursive: true});

    const failuresByPackage = new Map<string, IFailure[]>();
    for (const failure of failures) {
        const list = failuresByPackage.get(failure.package) ?? [];
        list.push(failure);
        failuresByPackage.set(failure.package, list);
    }

    // Real Allure results where a runner produced them (Playwright).
    for (const report of reports) {
        if (!hasRun(report, 'playwright')) continue;
        if (!failuresByPackage.has(report.package)) continue;
        const resultsDir = join(root, report.path, 'allure-results');
        stagePackageResults(resultsDir, staging);

        // Traces were moved next to the report; keep them addressable from the bundle.
        const tracesDir = join(root, report.path, REPORT_DIR, PUBLISH_DIR, 'traces');
        if (existsSync(tracesDir)) {
            mkdirSync(join(publishDir, 'traces'), {recursive: true});
            for (const file of readdirSync(tracesDir)) {
                copyFileSync(join(tracesDir, file), join(publishDir, 'traces', file));
            }
        }
    }

    // Everything else (tap, vitest) has no Allure results: synthesise them.
    let synthesised = 0;
    for (const [, list] of failuresByPackage) {
        for (const failure of list) {
            if (failure.runner === 'playwright') continue;
            const id = shortHash(failure.package, failure.suite, failure.name);
            writeFileSync(
                join(staging, `${id}-result.json`),
                JSON.stringify(syntheticResult(failure), null, 2),
            );
            synthesised += 1;
        }
    }

    const stagingOut = join(outDir, '.staging', 'allure-report');
    const allureExit = await runAllure(
        ['awesome', '--single-file', '-o', stagingOut, join(outDir, '.staging', 'allure-results')],
        root,
    );
    if (allureExit !== 0) {
        process.stderr.write(
            `blong-dev: allure exited with ${allureExit}; the failures report has no HTML (JSON is still written)\n`,
        );
    }

    // Publish a fixed layout: index.html next to failures.json, whatever path
    // Allure chose inside its staging output.
    const indexHtml = findIndexHtml(stagingOut);
    if (indexHtml) {
        copyFileSync(indexHtml, join(publishDir, 'index.html'));
        const allureSummary = join(dirname(indexHtml), 'summary.json');
        if (existsSync(allureSummary))
            copyFileSync(allureSummary, join(publishDir, 'summary.json'));
    }

    const failuresJson = join(publishDir, 'failures.json');
    const summaryMd = join(publishDir, 'failures.md');
    writeFileSync(failuresJson, buildFailuresJson(reports, failuresByPackage, meta));
    writeFileSync(summaryMd, renderFailuresSummary(failuresByPackage, meta));

    if (synthesised > 0) {
        process.stdout.write(
            `# failures bundle: ${failures.length} failing test(s), ${synthesised} synthesised Allure result(s)\n`,
        );
    }

    return {publishDir, failuresJson, summaryMd, count: failures.length};
}
