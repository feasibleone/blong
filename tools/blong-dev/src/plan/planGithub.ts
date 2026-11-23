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

import {
    CLAIM_LABEL,
    claimMarker,
    hostLabel,
    isHostLabel,
    type IPlanClaim,
} from './planOwnership.ts';

/** GitHub's own limit on an issue body. */
export const ISSUE_BODY_LIMIT = 65_536;

/** Leave room for the truncation note and the header this module adds. */
const SAFE_BODY = ISSUE_BODY_LIMIT - 2_048;

/** One answer of the `gh` client, as a caller reads it. */
export interface IGhResult {
    ok: boolean;
    out: string;
    err: string;
}

/** A `gh` stand-in, so a test can publish without a network. */
export type GhRunner = (args: string[], input?: string) => IGhResult;

let injectedRunner: GhRunner | undefined;

/**
 * Replace the `gh` client, or put the spawned one back.
 *
 * The claim has a reader seam because a plan published by another host has no local checkout; this
 * one is for the other half — the calls a publication *makes*. A claim's labels are written by
 * `plan init` on the issue it has just created, and a path that can only be exercised against
 * GitHub is a path nothing checks, which is exactly how the labels went missing on the first
 * publication (`@@D-967`).
 */
export function setGhRunner(runner: GhRunner | null): void {
    injectedRunner = runner ?? undefined;
}

/** One issue, as the tooling needs it. */
export interface IIssueRef {
    number: number;
    url: string;
    title?: string;
}

/** Run `gh`, capturing its answer instead of throwing. */
function gh(args: string[], input?: string): IGhResult {
    if (injectedRunner) return injectedRunner(args, input);
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
export function labelEnsure(
    repo: string,
    label: string,
    description = 'Tracked by a plan in plans/',
    color = '5319E7',
): void {
    gh([
        'label',
        'create',
        label,
        '--repo',
        repo,
        '--description',
        description,
        '--color',
        color,
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

/** What an issue says about the plan behind it. */
export interface IIssueOwnership {
    /** The host holding the plan, when one does. */
    claim?: IPlanClaim;
    /** The day the local `plan.md` was removed, when it was. */
    removedAt?: string;
    /**
     * The plan's front matter, published as a block a host reads back.
     *
     * The issue is the source of record once the local file is gone, so what a rebuild needs must
     * travel with it: the approval date, the Slack channel and a `closed` status are in no other
     * place (@@T-761). It goes inside an HTML comment, so a reader of the issue does not see it.
     */
    frontMatter?: string;
}

/** How the published front matter opens, and the token that ends it. */
const FRONT_MATTER_OPEN = '<!-- plan-front-matter';
const COMMENT_CLOSE = '-->';

/**
 * The body an issue carries: a header that says where the plan is being worked, the plan's front
 * matter in a comment a host reads back, and the plan itself.
 *
 * The header is the one place both hosts can see the same fact. A plan is a local folder, and the
 * folder is gitignored, so two hosts working one plan edit two memory trees that never meet; the
 * claim is what stops that, and it has to live where both can read it. So the issue says who holds
 * the plan, carries a marker a machine reads back (`<!-- plan-claim host="…" -->`), and — once the
 * local file has been removed — says that this issue is the source of record.
 *
 * A plan longer than GitHub's limit is cut at the limit with a note naming the local file, because
 * refusing to publish leaves the team with no record at all — and the note says which half is
 * missing.
 */
export function issueBody(planBody: string, slug: string, ownership: IIssueOwnership = {}): string {
    const header = issueHeader(slug, ownership) + frontMatterBlock(ownership.frontMatter);
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

/**
 * The front matter as the issue carries it: a comment, so it does not reach the rendered page.
 *
 * A YAML value may hold `-->`, which would end the comment early and spill the rest into the body;
 * the token is written as an entity and put back when the block is read.
 */
function frontMatterBlock(frontMatter: string | undefined): string {
    const text = frontMatter?.trim();
    if (!text) return '';
    const safe = text.replaceAll(COMMENT_CLOSE, '--&gt;');
    return `${FRONT_MATTER_OPEN}\n${safe}\n${COMMENT_CLOSE}\n\n`;
}

/**
 * The front matter an issue carries, as YAML text, or `undefined` when it carries none.
 *
 * A body published before the block existed answers `undefined`, and a rebuild then falls back to
 * defaults it names.
 */
export function issueFrontMatter(body: string): string | undefined {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const open = lines.findIndex(line => line.trimStart().startsWith(FRONT_MATTER_OPEN));
    if (open < 0) return undefined;
    const rest = lines.slice(open + 1);
    const close = rest.findIndex(line => line.trim() === COMMENT_CLOSE);
    if (close < 0) return undefined;
    return rest.slice(0, close).join('\n').trim().replaceAll('--&gt;', COMMENT_CLOSE);
}

/** The sentences a reader sees, and the marker a host reads. */
function issueHeader(slug: string, ownership: IIssueOwnership): string {
    if (ownership.removedAt) {
        return (
            `> The local \`plans/${slug}/plan.md\` was removed on ${ownership.removedAt}, when the ` +
            'plan was released. This issue is the source of record: every task below links to the ' +
            'memory entry that holds its detail.\n\n'
        );
    }
    const claim = ownership.claim;
    if (claim) {
        const who = claim.by ? `\`${claim.host}\` (${claim.by})` : `\`${claim.host}\``;
        return (
            `> Mirrored from \`plans/${slug}/plan.md\`, claimed by ${who} on ${claim.at}. While ` +
            'that host works the plan the local copy is the source and this issue is its mirror; ' +
            'progress is updated as its tasks close.\n\n' +
            `${claimMarker(claim)}\n\n`
        );
    }
    return (
        `> Planned here, with its working copy in \`plans/${slug}/plan.md\`. No host has claimed ` +
        'it yet: a claim is what stops two hosts from editing the same memory files, and nothing ' +
        'below advances until one does.\n\n'
    );
}

/** One issue as the ownership check needs it. */
export interface IIssueState {
    body?: string;
    labels?: string[];
    title?: string;
    url?: string;
}

/** A reader of one issue, so a test can answer without `gh`. */
export type IssueReader = (repo: string, issue: number) => IIssueState | undefined;

let injectedIssueReader: IssueReader | undefined;

/**
 * Replace the issue reader, or put the `gh`-backed one back.
 *
 * The claim reads the issue before it writes anything, and a test of a claim on a plan it has no
 * checkout of cannot reach GitHub — so the read is the one seam it needs. Nothing else in this
 * module is injected: a write is asserted by what it publishes.
 */
export function setIssueReader(reader: IssueReader | null): void {
    injectedIssueReader = reader ?? undefined;
}

/** Read an issue's body, labels, title and address, or `undefined` when it cannot be read. */
export function issueView(repo: string, issue: number): IIssueState | undefined {
    if (injectedIssueReader) return injectedIssueReader(repo, issue);
    const result = gh([
        'issue',
        'view',
        String(issue),
        '--repo',
        repo,
        '--json',
        'body,labels,title,url',
    ]);
    if (!result.ok) return undefined;
    try {
        const parsed = JSON.parse(result.out) as {
            body?: string;
            labels?: {name?: string}[];
            title?: string;
            url?: string;
        };
        return {
            ...(typeof parsed.body === 'string' ? {body: parsed.body} : {}),
            ...(typeof parsed.title === 'string' ? {title: parsed.title} : {}),
            ...(typeof parsed.url === 'string' ? {url: parsed.url} : {}),
            labels: (parsed.labels ?? [])
                .map(label => label.name ?? '')
                .filter(name => name !== ''),
        };
    } catch {
        return undefined;
    }
}

/**
 * Drop the header a published issue carries above the plan.
 *
 * An issue body is the plan without its front matter, preceded by the sentences that say where the
 * plan is being worked, the marker a host reads back and the front-matter comment a rebuild restores
 * from. Rebuilding a local plan from the issue therefore starts by taking that preamble off: the
 * leading blockquote block, the blank lines around it, the `plan-claim` marker when a claim left
 * one, and the front-matter comment. Only the leading block is touched — a blockquote further down
 * belongs to the plan.
 */
export function stripIssueHeader(body: string): string {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    let index = 0;
    const skipBlank = (): void => {
        while (index < lines.length && (lines[index] ?? '').trim() === '') index += 1;
    };
    skipBlank();
    while (index < lines.length && (lines[index] ?? '').trimStart().startsWith('>')) index += 1;
    skipBlank();
    while (index < lines.length && /^\s*<!--\s*plan-claim[^>]*-->\s*$/.test(lines[index] ?? '')) {
        index += 1;
        skipBlank();
    }
    if (index < lines.length && (lines[index] ?? '').trimStart().startsWith(FRONT_MATTER_OPEN)) {
        index += 1;
        while (index < lines.length && (lines[index] ?? '').trim() !== COMMENT_CLOSE) index += 1;
        index += 1;
        skipBlank();
    }
    return lines.slice(index).join('\n');
}

/** What a claim wants an issue's labels to be, given what they are (`@@D-967`). */
export interface IClaimLabels {
    /** The label that names this host. */
    wanted: string;
    /** Labels to add: the bare claim and the host's own. */
    add: string[];
    /** A host label left behind by a takeover, which would be a second answer to one question. */
    remove: string[];
    /** The login that took the claim, which the issue is assigned to when it is known. */
    assignee?: string;
    /** Whether the issue already says who holds the plan. */
    holds: boolean;
}

/**
 * The labels a claim puts on its issue, and whether they are already there.
 *
 * The body's marker is the record a host reads back; the labels are what the issue *list* shows
 * without opening anything, which is what a second host checks before it starts. Both are the claim
 * (`@@D-967`), so every path that publishes a claimed plan goes through this one decision — and the
 * first publication was the one that skipped it, leaving an issue that reads as claimed in its body
 * and as unclaimed in every list.
 *
 * Pure, because the comparison is the part worth testing: a test that had to run `gh` would be a test
 * nobody runs, which is how the gap survived.
 */
export function claimLabelsChange(claim: IPlanClaim, present: string[]): IClaimLabels {
    const wanted = hostLabel(claim.host);
    const others = present.filter(other => isHostLabel(other) && other !== wanted);
    return {
        wanted,
        add: [CLAIM_LABEL, wanted],
        remove: others,
        ...(claim.by ? {assignee: claim.by} : {}),
        holds: present.includes(CLAIM_LABEL) && present.includes(wanted) && others.length === 0,
    };
}

/** Add or remove labels and assignees on an issue. Never fatal: the body is the record. */
export function issueTrack(
    repo: string,
    issue: number,
    change: {addLabels?: string[]; removeLabels?: string[]; assignee?: string; unassign?: string},
): void {
    const args = ['issue', 'edit', String(issue), '--repo', repo];
    for (const label of change.addLabels ?? []) args.push('--add-label', label);
    for (const label of change.removeLabels ?? []) args.push('--remove-label', label);
    if (change.assignee) args.push('--add-assignee', change.assignee);
    if (change.unassign) args.push('--remove-assignee', change.unassign);
    if (args.length > 5) gh(args);
}

/** The login `gh` is authenticated as, when it can say. */
export function ghLogin(): string | undefined {
    const result = gh(['api', 'user', '--jq', '.login']);
    return result.ok && result.out !== '' ? result.out : undefined;
}

/** A short answer for a caller that wants one line: the issue's own URL. */
export function issueSummary(issue: IIssueRef, repo: string): string {
    return `${repo}#${issue.number} ${issue.url}`;
}

/** Run a command for a caller that needs its output, with a clear failure. */
export function gitOutput(root: string, args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
}
