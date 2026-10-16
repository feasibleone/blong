/**
 * What the diagnosis looks like.
 *
 * The console view is the product: one header line that says which run and how it was chosen, then
 * one block per failing package with the test, its location, the reason, the raw evidence and the
 * verdict. It is written to be read in one screen and to be enough on its own — a reader who has to
 * open the artifact to understand the answer has been sent back to the 35 calls this command
 * exists to replace (@@D-561).
 *
 * `--json` prints the diagnosis itself, which is what a tool or another agent should read;
 * `--write` renders the same answer as markdown beside it.
 */

import {
    describeCounts,
    formatDurationMs,
    statusIcon,
    type TestStatus,
} from '../report/reportTypes.ts';
import type {ICiFailure, ICiPackage, IDiagnosis} from './types.ts';

/** How many failing tests of one package the console view lists in full. */
const MAX_FAILURES_PER_PACKAGE = 5;

/** How many lines of raw evidence the default view shows. */
const INLINE_EVIDENCE_LINES = 3;

/** Indent of a continuation line under a labelled field. */
const CONTINUE = ' '.repeat(13);

/** One line per row of the run list. */
export interface IRunRow {
    number: number;
    commit: string;
    branch: string;
    conclusion: string;
    createdAt: string;
    failing?: string[];
}

/** One line per row of a package's run history. */
export interface IHistoryRow {
    run: number;
    status: TestStatus;
    counts: {total: number; passed: number; failed: number};
    testsMs: number;
}

/** A labelled block of lines, with every line after the first indented under the label. */
function field(label: string, text: string | undefined, limit?: number): string[] {
    if (!text) return [];
    let lines = text.split('\n').filter(line => line.trim() !== '');
    const dropped = limit !== undefined && lines.length > limit ? lines.length - limit : 0;
    if (limit !== undefined) lines = lines.slice(0, limit);
    const rendered = [`    ${label.padEnd(9)}${lines[0] ?? ''}`];
    for (const line of lines.slice(1)) rendered.push(`${CONTINUE}${line}`);
    if (dropped > 0) rendered.push(`${CONTINUE}… ${dropped} more line(s) — --full prints them`);
    return rendered;
}

/** What the evidence is called, so a reader knows which file the excerpt came from. */
function evidenceLabel(failure: ICiFailure): string {
    if (failure.runner === 'tap') return 'raw tap';
    if (failure.runner === 'storybook' || failure.runner === 'jest') return 'jest log';
    return 'evidence';
}

function failureBlock(failure: ICiFailure, options: {full?: boolean}): string[] {
    const lines: string[] = [];
    // `(unparsed)` is the report's own name for a failure it could not attribute to a file, and
    // repeating it in front of every test says nothing.
    const suite =
        failure.suite && failure.suite !== '(unparsed)' && !failure.test.startsWith(failure.suite)
            ? `${failure.suite} › `
            : '';
    lines.push(`    test     ${suite}${failure.test}`);
    if (failure.file) {
        lines.push(`    where    ${failure.file}${failure.line ? `:${failure.line}` : ''}`);
    }
    lines.push(
        `    runner   ${failure.runner}` +
            (failure.history ? ` · ${failure.history.kind} against the base branch` : '') +
            (failure.source === 'artifact' ? ' · reason from the artifact' : ''),
    );
    lines.push(...field('reason', failure.message));
    lines.push(
        ...field(
            evidenceLabel(failure),
            failure.evidence,
            options.full ? undefined : INLINE_EVIDENCE_LINES,
        ),
    );
    if (failure.verdict) {
        lines.push(...field('verdict', `${failure.verdict.kind} — ${failure.verdict.reason}`));
    } else {
        lines.push(`    verdict  unknown — nothing in the evidence points at a cause`);
    }
    return lines;
}

function packageBlock(pkg: ICiPackage, index: number, options: {full?: boolean}): string[] {
    const lines: string[] = [];
    // A package-level verdict first: `leg-gap` is about the whole package and is the reason its
    // failures were missing from the bundle, which a reader needs before the failure itself.
    const verdict = pkg.verdict ?? pkg.failures.find(failure => failure.verdict)?.verdict;
    const counts =
        pkg.counts.total > 0
            ? `${describeCounts(pkg.counts)} (${pkg.counts.total} total)`
            : 'published no report — see the operation summary';
    lines.push(
        `[${index}] ${pkg.package}${pkg.path ? ` (${pkg.path})` : ''}` +
            `  ✖ ${verdict?.kind ?? 'failed'}`,
    );
    lines.push(
        `    legs     ${pkg.runners.join(', ') || '—'}` +
            (pkg.operation
                ? `   operation failed in ${pkg.operation.durationText ?? 'an unstated time'}`
                : ''),
    );
    lines.push(`    counts   ${counts}`);
    if (pkg.operation && pkg.operation.commands.length > 0) {
        lines.push(`    command  ${pkg.operation.commands.join(' ; ')}`);
    }
    if (pkg.previous) {
        const timing =
            pkg.previous.testsMs > 0 ? ` · ${formatDurationMs(pkg.previous.testsMs)} of tests` : '';
        const from = pkg.previous.source === 'bundle' ? ' (from the run\u2019s bundle)' : '';
        lines.push(
            `    prior    #${pkg.previous.run} ${statusIcon(pkg.previous.status)} ` +
                `${describeCounts(pkg.previous.counts)} (${pkg.previous.counts.total} total)` +
                `${timing}${from}`,
        );
    }
    if (pkg.verdict && pkg.failures.length === 0) {
        lines.push(...field('verdict', `${pkg.verdict.kind} — ${pkg.verdict.reason}`));
    }
    for (const failure of pkg.failures.slice(0, MAX_FAILURES_PER_PACKAGE)) {
        lines.push(...failureBlock(failure, options));
    }
    if (pkg.failures.length > MAX_FAILURES_PER_PACKAGE) {
        lines.push(
            `    …        ${pkg.failures.length - MAX_FAILURES_PER_PACKAGE} more failure(s) in the JSON`,
        );
    }
    return lines;
}

/** The console view of a diagnosis. */
export function renderDiagnosis(diagnosis: IDiagnosis, options: {full?: boolean} = {}): string {
    const lines: string[] = [];
    const failedOperations = diagnosis.operations.filter(
        operation => operation.verdict === 'failure',
    );
    const header = [
        `${diagnosis.target.workflow} #${diagnosis.target.run}`,
        diagnosis.target.commit ? diagnosis.target.commit.slice(0, 8) : '',
        failedOperations.length > 0
            ? `${failedOperations.length} failed operation(s)`
            : diagnosis.red
              ? 'red'
              : diagnosis.totals.flaky > 0
                ? `${diagnosis.totals.flaky} flaky test(s), no failure`
                : 'green',
    ].filter(part => part !== '');
    lines.push(header.join(' · '));
    if (diagnosis.target.how) lines.push(`  how      ${diagnosis.target.how}`);
    if (diagnosis.target.runUrl) lines.push(`  run      ${diagnosis.target.runUrl}`);
    for (const note of diagnosis.notes) lines.push(`  note     ${note}`);

    if (!diagnosis.red) {
        lines.push('');
        for (const pkg of diagnosis.packages) {
            for (const failure of pkg.failures) {
                lines.push(`  flaky    ${pkg.package}: ${failure.test} — passed on retry`);
            }
        }
        lines.push('  Nothing failed in this run.');
    } else {
        lines.push('');
        diagnosis.packages.forEach((pkg, index) => {
            lines.push(...packageBlock(pkg, index + 1, options), '');
        });
        const warnings = diagnosis.operations.filter(operation => operation.verdict === 'warning');
        if (warnings.length > 0) {
            lines.push(
                `  ${warnings.length} operation(s) completed with warnings: ` +
                    warnings.map(operation => operation.package).join(', '),
            );
        }
    }

    if (diagnosis.staleReport) {
        lines.push(
            '',
            `  note     ${diagnosis.staleReport.file} describes build #${diagnosis.staleReport.describesRun} ` +
                `while this run is #${diagnosis.target.run} — it is the local aggregation's output ` +
                'and is stale until `rush ci-report` runs here',
        );
    }
    if (diagnosis.artifactDir) {
        lines.push(`  artifact ${diagnosis.artifactDir}`);
    }
    return lines.join('\n');
}

/** The diagnosis as the machine contract. */
export function renderDiagnosisJson(diagnosis: IDiagnosis): string {
    return JSON.stringify(diagnosis, null, 2) + '\n';
}

/**
 * The diagnosis as markdown, for `--write`.
 *
 * The file is stamped with the run it describes and where the evidence came from, because the
 * thing next to it — `ci-report.md` — is exactly the artefact that misleads when it does not say
 * which build it is about.
 */
export function renderDiagnosisMarkdown(diagnosis: IDiagnosis): string {
    const lines: string[] = [];
    const {target} = diagnosis;
    lines.push(`# CI diagnosis — ${target.workflow} #${target.run}`, '');
    lines.push(
        `_${target.repository} · \`${target.commit.slice(0, 8)}\`${
            target.branch ? ` · ${target.branch}` : ''
        } · written ${new Date().toISOString()}_`,
        '',
    );
    lines.push(`- chosen because: ${target.how}`);
    if (target.runUrl) lines.push(`- run: <${target.runUrl}>`);
    lines.push(
        `- evidence: the published bundle${diagnosis.evidence === 'artifact' ? ' and the reports artifact' : ''}`,
        '',
    );
    for (const note of diagnosis.notes) lines.push(`- note: ${note}`);
    lines.push('');

    if (!diagnosis.red) {
        lines.push(
            diagnosis.totals.flaky > 0
                ? `${diagnosis.totals.flaky} flaky test(s) and no failure — the run is green.`
                : 'Nothing failed in this run.',
            '',
        );
        return lines.join('\n');
    }

    lines.push('| Package | Legs | Result | Verdict |', '| --- | --- | --- | --- |');
    for (const pkg of diagnosis.packages) {
        const verdict = pkg.failures.find(failure => failure.verdict)?.verdict ?? pkg.verdict;
        lines.push(
            `| ${pkg.package} | ${pkg.runners.join(', ') || '—'} | ` +
                `${describeCounts(pkg.counts)} (${pkg.counts.total} total) | ${verdict?.kind ?? 'failed'} |`,
        );
    }
    lines.push('');

    for (const pkg of diagnosis.packages) {
        lines.push(`## ${pkg.package}`, '');
        if (pkg.previous) {
            lines.push(
                `Previous published run: #${pkg.previous.run} ${statusIcon(pkg.previous.status)} ` +
                    `${describeCounts(pkg.previous.counts)} (${pkg.previous.counts.total} total) · ` +
                    `${formatDurationMs(pkg.previous.testsMs)} of tests`,
                '',
            );
        }
        if (pkg.verdict && pkg.failures.length === 0) {
            lines.push(`**${pkg.verdict.kind}** — ${pkg.verdict.reason}`, '');
        }
        for (const failure of pkg.failures) {
            lines.push(`### ${failure.suite ? `${failure.suite} › ` : ''}${failure.test}`, '');
            const parts = [`- runner: \`${failure.runner}\``];
            if (failure.file)
                parts.push(
                    `- location: \`${failure.file}${failure.line ? `:${failure.line}` : ''}\``,
                );
            if (failure.history) parts.push(`- against the base branch: ${failure.history.kind}`);
            lines.push(...parts, '');
            if (failure.message) lines.push('```', failure.message, '```', '');
            if (failure.evidence) {
                lines.push(
                    `Raw evidence (${evidenceLabel(failure)}):`,
                    '',
                    '```',
                    failure.evidence,
                    '```',
                    '',
                );
            }
            if (failure.verdict)
                lines.push(`**Verdict: ${failure.verdict.kind}** — ${failure.verdict.reason}`, '');
            else
                lines.push('**Verdict: unknown** — nothing in the evidence points at a cause.', '');
        }
    }
    return lines.join('\n');
}

/** The recent runs of a workflow, one line each. */
export function renderRuns(rows: readonly IRunRow[], workflow: string): string {
    if (rows.length === 0) return `no ${workflow} run is visible`;
    const lines = [`${workflow} runs, newest first:`];
    for (const row of rows) {
        const failing = row.failing === undefined ? '' : `  ← ${row.failing.join(', ') || 'green'}`;
        lines.push(
            `  #${String(row.number).padEnd(4)} ${row.commit.slice(0, 8)} ${row.branch.padEnd(32)} ` +
                `${row.conclusion.padEnd(10)} ${row.createdAt}${failing}`,
        );
    }
    return lines.join('\n');
}

/** One package's published runs, newest first. */
export function renderHistory(pkg: string, rows: readonly IHistoryRow[]): string {
    if (rows.length === 0) return `no published run mentions ${pkg}`;
    const lines = [`${pkg} — published runs, newest first:`];
    for (const row of rows) {
        lines.push(
            `  #${String(row.run).padEnd(4)} ${statusIcon(row.status)} ` +
                `${describeCounts({...row.counts, flaky: 0, skipped: 0, todo: 0})} ` +
                `(${row.counts.total} total) · ${formatDurationMs(row.testsMs)} of tests`,
        );
    }
    return lines.join('\n');
}
