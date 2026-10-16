/**
 * `blong-dev ci` — what failed in a run, and why.
 *
 * The command exists because answering that question took thirty-five tool calls: fetch the
 * failure bundle, notice the run's own summary named an operation the bundle does not have, find
 * the job log, download a 44MB artifact, read the raw TAP stream, and compare with the previous
 * run of the same package. All of that is one command here, and the answer says which run it is
 * about, how it was chosen, and what it could not see (@@D-561).
 *
 * Usage:
 *   blong-dev ci failures [--pr <n> | --run <n> | --sha <sha> | --branch <name>]
 *                         [--repo <owner/name>] [--workflow <name>] [--site <url>]
 *                         [--full] [--json] [--write] [--strict]
 *   blong-dev ci runs [--limit <n>] [--repo <owner/name>]
 *   blong-dev ci history <package…> [--limit <n>]
 */

import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

import {diagnose} from '../ci/diagnose.ts';
import {artifactEvidence} from '../ci/evidence.ts';
import {ghApiJson, ghAvailable, ghRun, ghText} from '../ci/gh.ts';
import {parseOperationResults} from '../ci/operations.ts';
import {
    renderDiagnosis,
    renderDiagnosisJson,
    renderDiagnosisMarkdown,
    renderHistory,
    renderRuns,
    type IHistoryRow,
    type IRunRow,
} from '../ci/render.ts';
import {fetchFailures, fetchPackageSummary, siteBase} from '../ci/site.ts';
import {
    DEFAULT_WORKFLOW,
    recentRuns,
    resolveRepo,
    resolveTarget,
    type ITargetFlags,
} from '../ci/target.ts';
import type {IDiagnosis, IRunComparison} from '../ci/types.ts';
import type {IFailuresJson} from '../report/failuresBundle.ts';
import {repoRoot} from '../report/reportPaths.ts';

/** Where a written diagnosis goes, relative to the repository root. */
const DIAGNOSIS_FILE = 'ci-diagnosis.md';

/** The local aggregation's output, whose staleness the tool reports. */
const STALE_REPORT_FILE = 'ci-report.md';

/** Default number of runs `runs` and `history` look at. */
const DEFAULT_LIMIT = 10;

interface IFlags extends ITargetFlags {
    verb: string;
    positional: string[];
    json: boolean;
    full: boolean;
    write: boolean;
    strict: boolean;
    limit?: number;
    /** Reports site to read instead of this repository's default. */
    site?: string;
}

/** Flags that take a value, so a bare `--flag` is not read as one. */
const VALUED = new Set(['pr', 'run', 'sha', 'repo', 'workflow', 'branch', 'site', 'limit']);

/** Split `blong-dev ci` arguments into a verb and flags. */
export function parseCiFlags(args: readonly string[]): IFlags {
    const flags: IFlags = {
        verb: '',
        positional: [],
        json: false,
        full: false,
        write: false,
        strict: false,
    };
    const values: Record<string, string> = {};

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!;
        if (!arg.startsWith('-')) {
            // A bare run number or a run URL is the run: the shortest way to ask for one, and
            // never a verb.
            const bare = /^\d+$/.test(arg) || /\/actions\/runs\/\d+/.test(arg);
            if (bare && values['run'] === undefined) {
                values['run'] = /(\d+)$/.exec(arg)?.[1] ?? arg;
                continue;
            }
            if (flags.verb === '') flags.verb = arg;
            else flags.positional.push(arg);
            continue;
        }
        const [rawName, inline] = arg.replace(/^--?/, '').split(/=(.*)/s) as [string, string?];
        const name = rawName.trim();
        if (VALUED.has(name)) {
            const value = inline ?? args[index + 1];
            if (inline === undefined) index += 1;
            if (value !== undefined) values[name] = value;
            continue;
        }
        if (name === 'json') flags.json = true;
        else if (name === 'full') flags.full = true;
        else if (name === 'write') flags.write = true;
        else if (name === 'strict') flags.strict = true;
    }

    return {
        ...flags,
        ...(values['pr'] ? {pr: values['pr']} : {}),
        ...(values['run'] ? {run: values['run']} : {}),
        ...(values['sha'] ? {sha: values['sha']} : {}),
        ...(values['repo'] ? {repo: values['repo']} : {}),
        ...(values['workflow'] ? {workflow: values['workflow']} : {}),
        ...(values['branch'] ? {branch: values['branch']} : {}),
        ...(values['site'] ? {site: values['site']} : {}),
        ...(values['limit'] ? {limit: Number(values['limit'])} : {}),
    };
}

/** The test job of a run: the one whose log carries the operation summary. */
interface IJob {
    id: number;
    name: string;
    status: string;
    conclusion: string;
}

/** The job whose log holds the operation summary, preferring one that failed. */
function pickTestJob(jobs: readonly IJob[]): IJob | undefined {
    const tests = jobs.filter(job => /test/i.test(job.name));
    return (
        tests.find(job => job.conclusion === 'failure') ??
        jobs.find(job => job.conclusion === 'failure') ??
        tests[0]
    );
}

/**
 * The run's operation summary, read from its job log.
 *
 * Two API calls (the job list, then one log) and worth both: the summary is the only place an
 * operation that failed without publishing a report appears at all (@@F-539).
 */
async function readOperations(
    repo: string,
    runId: number,
    notes: string[],
): Promise<ReturnType<typeof parseOperationResults>> {
    const jobsPath = `repos/${repo}/actions/runs/${runId}/jobs`;
    const body = await ghApiJson<{jobs?: IJob[]}>(jobsPath);
    if (!body?.jobs) {
        notes.push(
            `\`gh\` could not list the jobs of run ${runId}; the operation summary is missing`,
        );
        return [];
    }
    const job = pickTestJob(body.jobs);
    if (!job) {
        notes.push(`run ${runId} lists no test job; the operation summary is missing`);
        return [];
    }
    const log = await ghText([
        'api',
        `repos/${repo}/actions/jobs/${job.id}/logs`,
        '--allow-escape-sequences',
    ]);
    if (log === undefined) {
        notes.push(
            `the log of job \`${job.name}\` could not be read; the operation summary is missing`,
        );
        return [];
    }
    return parseOperationResults(log);
}

/**
 * Download the run's `reports` artifact and read the reasons out of it.
 *
 * `gh run download` unpacks every package's `.ci-report/`, which is what makes `--full` slow and
 * why it is opt-in. A run whose artifact expired cannot be diagnosed this way, and the answer says
 * so rather than reporting the gap as a green leg.
 */
async function downloadReports(
    repo: string,
    runId: number,
    into: string,
    notes: string[],
): Promise<boolean> {
    // `gh run download` refuses to write over an existing file, so a run diagnosed once is either
    // reused as it stands or cleared first — the unpacked artifact is the cache, and re-reading it
    // offline is the point of keeping it under `dev/`.
    if (existsSync(join(into, 'ci-failures'))) {
        notes.push(
            `reusing the \`reports\` artifact already unpacked in ${relative(process.cwd(), into)}`,
        );
        return true;
    }
    rmSync(into, {recursive: true, force: true});
    const result = await ghRun([
        'run',
        'download',
        String(runId),
        '-R',
        repo,
        '-n',
        'reports',
        '-D',
        into,
    ]);
    if (result.code === 0) return true;
    const reason =
        result.stderr
            .trim()
            .split('\n')
            .find(line => line.trim() !== '') ?? `gh exited ${result.code}`;
    notes.push(
        `the \`reports\` artifact of run ${runId} could not be downloaded (${reason}); a run older ` +
            'than the artifact retention window cannot be read this way, and the answer rests on ' +
            'the published bundle',
    );
    return false;
}

/** The build number the local aggregation last wrote, when its file is there. */
export function staleReport(
    root: string,
    run: number,
): {file: string; describesRun: number} | undefined {
    const file = join(root, STALE_REPORT_FILE);
    if (!existsSync(file)) return undefined;
    const heading = readFileSync(file, 'utf8').slice(0, 4000);
    const described = /build #(\d+)/.exec(heading)?.[1];
    if (!described) return undefined;
    const describesRun = Number(described);
    return describesRun < run ? {file: STALE_REPORT_FILE, describesRun} : undefined;
}

/**
 * The same package in an earlier run, from the reports site.
 *
 * Two documents can answer it and the order matters. The package's page carries the counts and the
 * test time, and it is what the comparison is for. When a package published an Allure report
 * instead — every browser leg does — there is no page of ours to read, and the run's failure bundle
 * is what is left: it says whether the package was red, and nothing about how long it took. Build
 * #621 was a run of exactly that shape (@@F-545).
 */
function comparisonReader(
    base: string,
    workflow: string,
): (pkg: string, run: number) => Promise<IRunComparison | undefined> {
    const bundles = new Map<number, IFailuresJson | undefined>();
    const noCounts = {total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, todo: 0};
    return async (pkg, run) => {
        const page = await fetchPackageSummary(base, pkg, workflow, run);
        if (page) {
            return {
                run,
                status: page.status,
                counts: page.counts,
                testsMs: page.testsMs,
                source: 'page',
            };
        }
        if (!bundles.has(run)) bundles.set(run, await fetchFailures(base, workflow, run));
        const bundle = bundles.get(run);
        const entry = bundle?.packages.find(candidate => candidate.package === pkg);
        if (!entry) {
            // Not in a bundle, and the run published no page for it: it had no problem test, which
            // is the comparison the timeout verdict needs. The counts are unknown and left at zero
            // rather than invented.
            return {run, status: 'passed', counts: {...noCounts}, testsMs: 0, source: 'bundle'};
        }
        const failed = entry.failures.some(failure => failure.status !== 'flaky');
        return {
            run,
            status: failed ? 'failed' : 'flaky',
            counts: entry.counts,
            testsMs: 0,
            source: 'bundle',
        };
    };
}

/** `blong-dev ci failures`. */
async function failures(flags: IFlags, root: string): Promise<void> {
    const base = siteBase(flags.site);
    const notes: string[] = [];
    const resolved = await resolveTarget(flags, base);
    if (!resolved) {
        process.stderr.write(
            'blong-dev: no run to diagnose — pass --run <n>, --pr <n> or --sha <sha>\n',
        );
        process.exitCode = 1;
        return;
    }
    const {target, history} = resolved;
    notes.push(...resolved.notes);

    const bundle = await fetchFailures(base, target.workflow, target.run);
    if (bundle === undefined) {
        notes.push(
            `the reports site has no failure bundle for #${target.run}` +
                ` (${base}/failures/${target.workflow}/${target.run}/) — a green run publishes none`,
        );
    }

    const authorized = await ghAvailable();
    const operations =
        authorized && target.runId
            ? await readOperations(target.repository, target.runId, notes)
            : [];
    if (!authorized) {
        notes.push(
            '`gh` is not authenticated here, so the operation summary, the job log and the ' +
                'artifact are unavailable; the answer rests on what the reports site published',
        );
    }

    let artifactDir: string | undefined;
    let evidence: ReturnType<typeof artifactEvidence> | undefined;
    if (flags.full) {
        if (!authorized || !target.runId) {
            notes.push('--full needs an authenticated `gh` and a run id; reading the bundle only');
        } else {
            const into = join(root, 'dev', 'ci', String(target.run));
            if (await downloadReports(target.repository, target.runId, into, notes)) {
                artifactDir = into;
                evidence = artifactEvidence(into);
            }
        }
    }

    const stale = staleReport(root, target.run);
    const diagnosis = await diagnose({
        target,
        ...(bundle ? {bundle} : {}),
        operations,
        history,
        previous: comparisonReader(base, target.workflow),
        ...(evidence ? {evidence} : {}),
        ...(artifactDir ? {artifactDir} : {}),
        notes,
        ...(stale ? {staleReport: stale} : {}),
    });

    if (flags.json) process.stdout.write(renderDiagnosisJson(diagnosis));
    else process.stdout.write(renderDiagnosis(diagnosis, {full: flags.full}) + '\n');

    if (flags.write) {
        const file = join(root, DIAGNOSIS_FILE);
        writeFileSync(file, renderDiagnosisMarkdown(diagnosis));
        process.stdout.write(`# written: ${DIAGNOSIS_FILE}\n`);
    }

    if (flags.strict && needsAttention(diagnosis)) process.exitCode = 1;
}

/** True when a diagnosis carries something a strict run should fail on. */
function needsAttention(diagnosis: IDiagnosis): boolean {
    return diagnosis.packages.some(
        pkg =>
            pkg.legGap === true ||
            pkg.failures.some(
                failure => failure.verdict === undefined || failure.verdict.kind === 'unknown',
            ),
    );
}

/** `blong-dev ci runs`. */
async function runs(flags: IFlags): Promise<void> {
    const workflow = flags.workflow ?? DEFAULT_WORKFLOW;
    const repo = await resolveRepo(flags.repo);
    if (!repo) {
        process.stderr.write('blong-dev: `gh` could not tell which repository to read\n');
        process.exitCode = 1;
        return;
    }
    const list = await recentRuns(repo, workflow, flags.limit ?? DEFAULT_LIMIT);
    const base = siteBase(flags.site);
    const rows: IRunRow[] = [];
    for (const run of list) {
        const bundle =
            run.conclusion === 'failure'
                ? await fetchFailures(base, workflow, run.number)
                : undefined;
        rows.push({
            number: run.number,
            commit: run.headSha,
            branch: run.headBranch,
            conclusion: run.conclusion,
            createdAt: run.createdAt,
            ...(run.conclusion === 'failure'
                ? {failing: bundle ? bundle.packages.map(entry => entry.package) : ['no bundle']}
                : {}),
        });
    }
    process.stdout.write(renderRuns(rows, workflow) + '\n');
}

/** `blong-dev ci history <package…>`. */
async function history(flags: IFlags): Promise<void> {
    const packages = flags.positional;
    if (packages.length === 0) {
        process.stderr.write(
            'blong-dev: ci history needs a package name (e.g. `ci history blong-cli`)\n',
        );
        process.exitCode = 1;
        return;
    }
    const workflow = flags.workflow ?? DEFAULT_WORKFLOW;
    const repo = await resolveRepo(flags.repo);
    if (!repo) {
        process.stderr.write('blong-dev: `gh` could not tell which repository to read\n');
        process.exitCode = 1;
        return;
    }
    const base = siteBase(flags.site);
    // The run list once for every package asked about: a diagnosis names two or three packages,
    // and one call per package was three times the work for the same answer.
    const runs = await recentRuns(repo, workflow, flags.limit ?? DEFAULT_LIMIT);
    for (const pkg of packages) {
        const rows: IHistoryRow[] = [];
        for (const run of runs) {
            const summary = await fetchPackageSummary(base, pkg, workflow, run.number);
            if (!summary) continue;
            rows.push({
                run: run.number,
                status: summary.status,
                counts: summary.counts,
                testsMs: summary.testsMs,
            });
        }
        process.stdout.write(renderHistory(pkg, rows) + '\n');
    }
}

export async function ci(args: string[]): Promise<void> {
    const flags = parseCiFlags(args);
    const root = repoRoot(process.cwd());
    switch (flags.verb === '' ? 'failures' : flags.verb) {
        case 'failures':
            await failures(flags, root);
            break;
        case 'runs':
            await runs(flags);
            break;
        case 'history':
            await history(flags);
            break;
        default:
            process.stderr.write(
                `blong-dev: unknown \`ci\` verb "${flags.verb}" — use failures, runs or history\n`,
            );
            process.exitCode = 1;
    }
}

/** Absolute path of a diagnosis written by a previous run of this command. */
export function diagnosisPath(root = process.cwd()): string {
    return resolve(root, DIAGNOSIS_FILE);
}
