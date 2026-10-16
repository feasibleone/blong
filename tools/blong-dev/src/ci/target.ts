/**
 * Which run the diagnosis is about.
 *
 * The default is the one the usual work needs: the **release-please PR** — pushing to main opens
 * one, and it is the run that decides whether a release can go out. `--pr`, `--run`, `--sha` and a
 * branch name the others. A run that is still going or was cancelled published nothing, so the
 * newest *completed* run of the chosen scope is the target, and the skipped ones are named in the
 * answer rather than left to be discovered (@@D-561).
 *
 * Resolution prefers `gh`, because only it knows about runs that produced no report; without it
 * the site's `latest` alias is the fallback, and the answer says so.
 */

import {ghApiJson, ghCliJson, ghRun} from './gh.ts';
import {fetchFailures} from './site.ts';
import type {ICiTarget} from './types.ts';

/** The fields of a workflow run this module needs. */
interface IRunSummary {
    number: number;
    databaseId: number;
    headSha: string;
    headBranch: string;
    status: string;
    conclusion: string;
    url: string;
    createdAt: string;
}

interface IPullSummary {
    number: number;
    title: string;
    headRefName: string;
    headRefOid: string;
    isDraft: boolean;
}

/** The work runs on: `main` unless a flag says otherwise. */
export const DEFAULT_WORKFLOW = 'Build';

/** The branch release-please opens its pull requests from. */
export const RELEASE_BRANCH_PREFIX = 'release-please--';

/** How many runs of a scope to look through before giving up on finding a completed one. */
const RUN_WINDOW = 20;

export interface ITargetFlags {
    pr?: string;
    run?: string;
    sha?: string;
    repo?: string;
    workflow?: string;
    branch?: string;
}

export interface IResolvedTarget {
    target: ICiTarget;
    /** The workflow's recent runs of this scope, newest first — the history for comparisons. */
    history: number[];
    /** Notes about what resolution skipped, for the answer to carry. */
    notes: string[];
}

/** `owner/repo`, from `--repo`, the environment, the remote of the working directory. */
export async function resolveRepo(flag?: string): Promise<string | undefined> {
    if (flag) return flag;
    if (process.env['GITHUB_REPOSITORY']) return process.env['GITHUB_REPOSITORY'];
    const view = await ghCliJson<{nameWithOwner?: string}>([
        'repo',
        'view',
        '--json',
        'nameWithOwner',
    ]);
    return view?.nameWithOwner;
}

/** The workflow's runs, newest first, as `gh run list --json` reports them. */
export async function recentRuns(
    repo: string,
    workflow: string,
    limit = RUN_WINDOW,
): Promise<IRunSummary[]> {
    const runs = await ghCliJson<IRunSummary[]>([
        'run',
        'list',
        '-R',
        repo,
        '-w',
        workflow,
        '-L',
        String(limit),
        '--json',
        'number,databaseId,headSha,headBranch,status,conclusion,url,createdAt',
    ]);
    return runs ?? [];
}

/** The newest run of a scope, with what was skipped on the way to it. */
function pickNewest(
    runs: readonly IRunSummary[],
    scope: (run: IRunSummary) => boolean,
): {run?: IRunSummary; skipped: IRunSummary[]} {
    const scoped = runs.filter(scope);
    const skipped = scoped.filter(
        run => run.status !== 'completed' || run.conclusion === 'cancelled',
    );
    const run = scoped.find(
        candidate => candidate.status === 'completed' && candidate.conclusion !== 'cancelled',
    );
    return {run, skipped};
}

/** One line naming the runs that were passed over, so the answer explains its own choice. */
function describeSkipped(skipped: readonly IRunSummary[]): string | undefined {
    if (skipped.length === 0) return undefined;
    const described = skipped
        .slice(0, 3)
        .map(run => `#${run.number} ${run.status === 'completed' ? run.conclusion : run.status}`)
        .join(', ');
    const rest = skipped.length > 3 ? `, +${skipped.length - 3} more` : '';
    return `skipped ${described}${rest}`;
}

/** The open release-please pull request, when there is one. */
async function releasePleasePr(repo: string): Promise<IPullSummary | undefined> {
    const prs = await ghCliJson<IPullSummary[]>([
        'pr',
        'list',
        '-R',
        repo,
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'number,title,headRefName,headRefOid,isDraft',
    ]);
    return prs?.find(pr => pr.headRefName.startsWith(RELEASE_BRANCH_PREFIX));
}

/** A named pull request, with the fields resolution needs. */
async function pullRequest(repo: string, number: string): Promise<IPullSummary | undefined> {
    return ghApiJson<IPullSummary>(`repos/${repo}/pulls/${number}`);
}

/** The target a bundle on the site describes, when `gh` cannot answer. */
async function targetFromSite(
    base: string,
    workflow: string,
    run: number | 'latest',
): Promise<ICiTarget | undefined> {
    const bundle = await fetchFailures(base, workflow, run);
    if (!bundle) return undefined;
    return {
        repository: bundle.repository,
        workflow: bundle.workflow || workflow,
        run: bundle.run,
        commit: bundle.commit,
        branch: '',
        runUrl: bundle.runUrl,
        how:
            run === 'latest'
                ? 'the newest bundle the reports site published, which is the last run that had ' +
                  'anything to report — a flaky test counts, and a later clean run publishes ' +
                  'nothing, so this is not necessarily the newest run (`gh` was unavailable to tell)'
                : `run #${run} as the reports site published it`,
    };
}

/**
 * Resolve the run to diagnose.
 *
 * Every path ends with a run number and, when `gh` answered, GitHub's id for it — the log and the
 * artifacts are addressed by the id, while every page on the reports site uses the number.
 */
export async function resolveTarget(
    flags: ITargetFlags,
    base: string,
): Promise<IResolvedTarget | undefined> {
    const workflow = flags.workflow ?? DEFAULT_WORKFLOW;
    const repo = await resolveRepo(flags.repo);
    const notes: string[] = [];

    if (!repo) {
        const target = await targetFromSite(
            base,
            workflow,
            flags.run ? Number(flags.run) : 'latest',
        );
        return target ? {target, history: [target.run], notes} : undefined;
    }

    const runs = await recentRuns(repo, workflow);
    if (runs.length === 0) {
        const result = await ghRun(['run', 'list', '-R', repo, '-w', workflow, '-L', '1']);
        notes.push(
            result.code === 0
                ? `no \`${workflow}\` run is visible for ${repo}`
                : `\`gh\` could not list runs for ${repo}: ${result.stderr.trim().split('\n')[0]}`,
        );
        const target = await targetFromSite(
            base,
            workflow,
            flags.run ? Number(flags.run) : 'latest',
        );
        return target ? {target, history: [target.run], notes} : undefined;
    }

    const history = runs.map(run => run.number);
    const of = (run: IRunSummary, how: string): IResolvedTarget => ({
        target: {
            repository: repo,
            workflow,
            run: run.number,
            runId: run.databaseId,
            commit: run.headSha,
            branch: run.headBranch,
            runUrl: run.url,
            how,
        },
        history,
        notes,
    });

    if (flags.run) {
        const run = runs.find(candidate => candidate.number === Number(flags.run));
        if (!run) {
            notes.push(
                `run #${flags.run} is not among the last ${runs.length} \`${workflow}\` runs; ` +
                    'older runs are only reachable through the reports site',
            );
            const target = await targetFromSite(base, workflow, Number(flags.run));
            return target ? {target, history: [target.run], notes} : undefined;
        }
        return of(run, `run #${run.number}, asked for`);
    }

    if (flags.pr) {
        const pr = await pullRequest(repo, flags.pr);
        if (!pr) {
            notes.push(`pull request ${flags.pr} could not be read`);
        } else {
            const scoped = runs.filter(
                run => run.headSha === pr.headRefOid || run.headBranch === pr.headRefName,
            );
            const {run, skipped} = pickNewest(scoped, () => true);
            const skippedText = describeSkipped(skipped);
            if (skippedText) notes.push(skippedText);
            if (run) return of(run, `pull request #${pr.number} (${pr.headRefName})`);
            notes.push(`no completed run of pull request #${pr.number} yet`);
        }
    }

    if (flags.sha) {
        const sha = flags.sha;
        const {run, skipped} = pickNewest(runs, candidate => candidate.headSha.startsWith(sha));
        const skippedText = describeSkipped(skipped);
        if (skippedText) notes.push(skippedText);
        if (run) return of(run, `the newest run of ${sha.slice(0, 8)}`);
    }

    if (flags.branch) {
        const {run, skipped} = pickNewest(runs, candidate => candidate.headBranch === flags.branch);
        const skippedText = describeSkipped(skipped);
        if (skippedText) notes.push(skippedText);
        if (run) return of(run, `the newest run of ${flags.branch}`);
    }

    // The default: the release-please pull request, and its runs.
    const pr = await releasePleasePr(repo);
    if (pr) {
        const scoped = runs.filter(
            run => run.headSha === pr.headRefOid || run.headBranch === pr.headRefName,
        );
        const {run, skipped} = pickNewest(scoped, () => true);
        const skippedText = describeSkipped(skipped);
        if (skippedText) notes.push(skippedText);
        if (run) {
            return of(
                run,
                `the release-please pull request #${pr.number} (${pr.title.trim()}), newest completed run`,
            );
        }
        notes.push(`the release-please pull request #${pr.number} has no completed run yet`);
    }

    const {run, skipped} = pickNewest(runs, candidate => true);
    const skippedText = describeSkipped(skipped);
    if (skippedText) notes.push(skippedText);
    if (!run) {
        notes.push(`no completed \`${workflow}\` run is visible; nothing to diagnose`);
        return undefined;
    }
    return of(run, `the newest completed \`${workflow}\` run (no release-please pull request)`);
}
