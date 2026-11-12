/**
 * The GitHub half of a plan: one issue per plan, kept in step with the plan file.
 *
 * `gh` is the client rather than the API over `got`, because the person running the
 * command is already authenticated with it and a token in this repository is one more
 * secret to leak. Every call is spawned, so a run without `gh` reports the reason and
 * leaves the plan file alone.
 *
 * The issue body is generated from the plan, never edited by hand: the plan is the
 * source and `blong-dev plan sync` is what publishes it. A body GitHub would refuse is
 * capped rather than rejected, with the cap stated in the issue itself.
 */

import {execFileSync, spawnSync} from 'node:child_process';

/** GitHub's own limit on an issue body. */
export const ISSUE_BODY_LIMIT = 65_536;

/** Leave room for the truncation note and the header this module adds. */
const SAFE_BODY = ISSUE_BODY_LIMIT - 2_048;

/** The answer every call reports. */
export interface IGhResult {
    ok: boolean;
    out: string;
    err: string;
}

/** One issue, as the tooling needs it. */
export interface IIssueRef {
    number: number;
    url: string;
    title?: string;
}

/** Run `gh`, capturing its answer instead of throwing. */
function gh(args: string[], input?: string): IGhResult {
    const result = spawnSync('gh', args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        ...(input === undefined ? {} : {input}),
    });
    if (result.error) return {ok: false, out: '', err: result.error.message};
    return {
        ok: result.status === 0,
        out: (result.stdout ?? '').trim(),
        err: (result.stderr ?? '').trim(),
    };
}

/** True when `gh` answers at all. */
export function ghAvailable(): boolean {
    return gh(['--version']).ok;
}

/** The `owner/name` this checkout pushes to, or `undefined`. */
export function originRepo(root: string): string | undefined {
    const result = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
        encoding: 'utf8',
    });
    if (result.status !== 0) return undefined;
    const url = (result.stdout ?? '').trim();
    const match = /github\.com[:/](?<owner>[^/]+)\/(?<name>[^/.]+)(?:\.git)?$/.exec(url);
    return match ? `${match.groups?.['owner']}/${match.groups?.['name']}` : undefined;
}

/** Ensure a label exists, creating it when it does not. Never fatal. */
export function labelEnsure(repo: string, label: string): void {
    gh([
        'label',
        'create',
        label,
        '--repo',
        repo,
        '--description',
        'Tracked by a plan in plans/',
        '--color',
        '5319E7',
        '--force',
    ]);
}

/** Find an issue by its exact title — the one a previous `plan init` created. */
export function issueFind(repo: string, title: string): IIssueRef | undefined {
    const result = gh([
        'issue',
        'list',
        '--repo',
        repo,
        '--state',
        'all',
        '--search',
        `${title} in:title`,
        '--json',
        'number,url,title',
        '--limit',
        '20',
    ]);
    if (!result.ok) return undefined;
    try {
        const found = JSON.parse(result.out) as IIssueRef[];
        return found.find(issue => issue.title === title);
    } catch {
        return undefined;
    }
}

/** Create an issue whose body is already the plan's markdown. */
export function issueCreate(input: {
    repo: string;
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
}): IIssueRef {
    const args = [
        'issue',
        'create',
        '--repo',
        input.repo,
        '--title',
        input.title,
        '--body-file',
        '-',
    ];
    for (const label of input.labels ?? []) args.push('--label', label);
    for (const assignee of input.assignees ?? []) args.push('--assignee', assignee);
    const result = gh(args, input.body);
    if (!result.ok) throw new Error(`gh issue create failed: ${result.err || result.out}`);
    // `gh issue create` prints the issue URL, which is the only identity it gives back.
    const url = result.out.split('\n').find(line => /^https?:\/\//.test(line)) ?? result.out;
    const number = Number(/(?<number>\d+)\/?$/.exec(url)?.groups?.['number'] ?? 0);
    return {number, url};
}

/** Replace an issue's body. */
export function issueEdit(input: {
    repo: string;
    issue: number;
    body?: string;
    title?: string;
}): void {
    const args = ['issue', 'edit', String(input.issue), '--repo', input.repo];
    if (input.title) args.push('--title', input.title);
    if (input.body !== undefined) args.push('--body-file', '-');
    const result = gh(args, input.body ?? '');
    if (!result.ok) throw new Error(`gh issue edit failed: ${result.err || result.out}`);
}

/** Add a comment, which is how a completion is announced without rewriting history. */
export function issueComment(repo: string, issue: number, body: string): void {
    const result = gh(
        ['issue', 'comment', String(issue), '--repo', repo, '--body-file', '-'],
        body,
    );
    if (!result.ok) throw new Error(`gh issue comment failed: ${result.err || result.out}`);
}

/**
 * The body an issue carries: a short provenance line and the plan without its front
 * matter.
 *
 * A plan longer than GitHub's limit is cut at the limit with a note naming the local
 * file, because refusing to publish leaves the team with no record at all — and the
 * note says which half is missing.
 */
export function issueBody(planBody: string, slug: string): string {
    const header =
        `> Mirrored from \`plans/${slug}/plan.md\` by \`blong-dev plan\`. ` +
        'Progress is updated as its tasks close; the local plan is the source.\n\n';
    const room = SAFE_BODY - header.length;
    if (planBody.length <= room) return header + planBody;
    const cut = planBody.slice(0, room);
    return (
        header +
        cut +
        `\n\n---\n\n_Truncated at GitHub's issue-body limit. The full plan is ` +
        `\`plans/${slug}/plan.md\`._\n`
    );
}

/** A short answer for a caller that wants one line: the issue's own URL. */
export function issueSummary(issue: IIssueRef, repo: string): string {
    return `${repo}#${issue.number} ${issue.url}`;
}

/** Run a command for a caller that needs its output, with a clear failure. */
export function gitOutput(root: string, args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
}
