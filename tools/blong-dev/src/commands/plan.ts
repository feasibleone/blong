/**
 * `blong-dev plan` — the plan is the board, the memory is the detail, the issue is the
 * shared copy.
 *
 * A plan starts as prose with a work breakdown whose tasks carry their detail. This
 * command is the transition and the upkeep:
 *
 * - `check` reads the plan, refuses a task it could not create, and reports a task whose
 *   memory entry has gone missing or drifted.
 * - `tasks` turns each task into a memory todo and trims the plan to a board of titles
 *   with `@@T-` references. `--apply` is the write; a dry run is the default.
 * - `init` approves the plan: it creates the tasks, mirrors the plan into a GitHub issue,
 *   opens the plan's Slack channel, and records both in the plan's front matter.
 * - `sync` re-reads the memory and ticks the plan (and republishes the issue) — what a
 *   reader watches after work has moved.
 * - `status` answers "how far is this plan" without opening anything.
 * - `adopt` puts existing work under the plan: a memory task, a friction, a decision, or
 *   an issue a plan inherited.
 *
 * The plan file lives in `plans/<slug>/plan.md` and is local; the issue and the channel
 * are what the rest of the team sees. `blong-dev memory close` already ticks the plan as
 * a side effect, so `sync` is the repair and the publish, not the usual path.
 */

import {existsSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

import {listEntries, type IMemoryEntryView} from '../memory/memoryView.ts';
import {
    ghAvailable,
    issueBody,
    issueComment,
    issueCreate,
    issueEdit,
    issueFind,
    labelEnsure,
    originRepo,
} from '../plan/planGithub.ts';
import {planFiles, plansRoot} from '../plan/planLink.ts';
import {entryLink, issueLinks} from '../plan/planLinks.ts';
import {
    bodyWithoutFrontMatter,
    planTitle,
    readPlan,
    renderPlan,
    renderTaskLine,
    writeMeta,
    type IPlanDocument,
} from '../plan/planParse.ts';
import {
    PLAN_ENTRIES_HEADING,
    addPlanEntry,
    planEntryLine,
    refreshPlanEntries,
} from '../plan/planSections.ts';
import {
    createPlanChannel,
    planChannelName,
    planChannelUrl,
    updatePlanChannelTopic,
} from '../plan/planSlack.ts';
import {createPlanTasks, planSlug} from '../plan/planTasks.ts';
import {repoRoot} from '../report/reportPaths.ts';
import {usageHint} from '../usage.ts';
import {UsageError} from '../utils/usageError.ts';
import {parseArgs} from './log.ts';

/** The verbs {@link usageHint} may name when a call fails. */
const PLAN_VERBS = new Set(['check', 'tasks', 'init', 'sync', 'status', 'adopt']);

/** Flags that take no value, so the argument after them is not theirs. */
const BOOLEAN_FLAGS = new Set([
    'apply',
    'update',
    'json',
    'check',
    'comment',
    'channel',
    'draft',
    'dry-run',
    'no-issue',
    'no-slack',
    'no-tasks',
    'plain',
]);

/** Rewrite a bare boolean flag as `--flag=true`, so the shared parser does not eat the next token. */
function guardBooleans(args: string[]): string[] {
    return args.map(arg =>
        arg.startsWith('--') && BOOLEAN_FLAGS.has(arg.slice(2)) ? `${arg}=true` : arg,
    );
}

/** A message a person can act on, printed rather than thrown. */
function fail(message: string): never {
    throw new UsageError(message);
}

/**
 * True when a boolean flag was given.
 *
 * `guardBooleans` rewrites a bare `--apply` as `--apply=true`, because the shared arg
 * parser reads the token after a bare flag as its value — so a boolean arrives in
 * `options` far more often than in `flags`, and both have to be read.
 */
function on(flags: Set<string>, options: Map<string, string>, name: string): boolean {
    return flags.has(name) || options.get(name) === 'true';
}

/** The file a plan argument names. */
export function resolvePlanFile(root: string, argument: string | undefined): string {
    if (argument) {
        const direct = resolve(argument);
        if (existsSync(direct)) {
            if (statSync(direct).isDirectory()) return onlyPlanIn(direct);
            return direct;
        }
        const inPlans = join(plansRoot(root), argument);
        if (existsSync(inPlans)) {
            return statSync(inPlans).isDirectory() ? onlyPlanIn(inPlans) : inPlans;
        }
        const withExtension = join(plansRoot(root), `${argument}.md`);
        if (existsSync(withExtension)) return withExtension;
        fail(`no plan at "${argument}" — it is a file, a folder under plans/, or a folder name`);
    }
    const files = planFiles(root);
    if (files.length === 1) return files[0]!;
    if (files.length === 0) fail('there is no plan under plans/ — name one');
    fail(`name a plan: ${files.map(file => relative(root, file)).join(', ')}`);
}

/** The single markdown file of a plan folder, preferring `plan.md`. */
function onlyPlanIn(dir: string): string {
    for (const name of ['plan.md', 'PLAN.md']) {
        const path = join(dir, name);
        if (existsSync(path)) return path;
    }
    const markdown = readdirSync(dir).filter(name => name.toLowerCase().endsWith('.md'));
    if (markdown.length === 1) return join(dir, markdown[0]!);
    if (markdown.length === 0) fail(`${dir} holds no plan`);
    fail(`${dir} holds several plans: ${markdown.join(', ')}`);
}

/** The entry a reference names, or the reason there is none. */
function entryFor(
    entries: readonly IMemoryEntryView[],
    id: string,
): {entry?: IMemoryEntryView; problem?: string} {
    const hits = entries.filter(entry => entry.id === id);
    if (hits.length === 0) return {problem: `${id} has no memory entry`};
    if (hits.length > 1) {
        return {
            problem: `${id} is held by ${hits.map(hit => hit.path).join(', ')} — it is ambiguous`,
        };
    }
    return {entry: hits[0]};
}

/** Whether an entry is finished, for the plan's checkbox. */
function isDone(entry: IMemoryEntryView): boolean {
    return entry.status === 'done' || entry.status === 'resolved' || entry.status === 'superseded';
}

/** The decisions and frictions a plan names, resolved against the memory. */
function supportingEntries(
    plan: IPlanDocument,
    entries: readonly IMemoryEntryView[],
): Array<{id: string; entry?: IMemoryEntryView; problem?: string}> {
    const text = plan.lines.join('\n');
    const ids = [
        ...new Set(
            [...text.matchAll(/@@(?<id>[FD]-\d{3})/g)].map(match => match.groups?.['id'] ?? ''),
        ),
    ].filter(Boolean);
    return ids.map(id => ({id, ...entryFor(entries, id)}));
}

/** Read a plan, refusing one the parser could not describe. */
function load(root: string, argument: string | undefined): IPlanDocument {
    const doc = loadRaw(root, argument);
    if (doc.problems.length > 0) {
        fail(`the plan has problems:\n${doc.problems.map(line => `  ${line}`).join('\n')}`);
    }
    return doc;
}

/** Read a plan as it is, problems and all, for the verbs whose job is to report them. */
function loadRaw(root: string, argument: string | undefined): IPlanDocument {
    return readPlan(resolvePlanFile(root, argument));
}

/** Print the plan's progress without opening the file. */
function status(
    root: string,
    plan: IPlanDocument,
    flags: Set<string>,
    options: Map<string, string>,
): void {
    const entries = listEntries(root);
    const tasks = plan.tasks.map(task => {
        const found = task.id ? entryFor(entries, task.id) : {};
        const done = found.entry ? isDone(found.entry) : task.checked;
        return {
            id: task.id,
            title: task.title,
            area: task.area ?? found.entry?.area,
            done,
            missing: task.id !== undefined && found.entry === undefined,
        };
    });
    const done = tasks.filter(task => task.done).length;
    const open = tasks.length - done;
    const supporting = supportingEntries(plan, entries);
    const areas = new Map<string, {done: number; open: number}>();
    for (const task of tasks) {
        const area = task.area ?? '(unknown)';
        const bucket = areas.get(area) ?? {done: 0, open: 0};
        if (task.done) bucket.done += 1;
        else bucket.open += 1;
        areas.set(area, bucket);
    }

    if (on(flags, options, 'json')) {
        process.stdout.write(
            `${JSON.stringify(
                {
                    plan: relative(root, plan.path),
                    title: planTitle(plan),
                    done,
                    open,
                    meta: plan.meta,
                    tasks,
                    decisions: supporting.map(item => ({id: item.id, ...item.entry})),
                },
                null,
                2,
            )}\n`,
        );
        return;
    }
    process.stdout.write(`# ${planTitle(plan)}\n`);
    process.stdout.write(`# ${relative(root, plan.path)}\n`);
    process.stdout.write(`# status: ${plan.meta.status ?? 'unapproved'}\n`);
    if (plan.meta.issueUrl) process.stdout.write(`# issue: ${plan.meta.issueUrl}\n`);
    if (plan.meta.conversationId) {
        process.stdout.write(
            `# channel: ${plan.meta.channelName ?? '?'} (${plan.meta.conversationId})\n`,
        );
        const url =
            plan.meta.channelUrl ??
            planChannelUrl({
                platform: plan.meta.platform,
                conversationId: plan.meta.conversationId,
            });
        if (url) process.stdout.write(`# channel link: ${url}\n`);
    }
    process.stdout.write(`# progress: ${done}/${tasks.length} done, ${open} open\n`);
    const decisions = supporting.filter(item => item.id.startsWith('D-'));
    const frictions = supporting.filter(item => item.id.startsWith('F-'));
    if (decisions.length > 0) {
        process.stdout.write(`# decisions: ${decisions.map(item => item.id).join(', ')}\n`);
    }
    if (frictions.length > 0) {
        process.stdout.write(`# frictions: ${frictions.map(item => item.id).join(', ')}\n`);
    }
    for (const item of supporting) {
        if (item.entry) {
            process.stdout.write(`#   ${item.id} ${item.entry.status} — ${item.entry.title}\n`);
        } else {
            process.stdout.write(`#   ${item.id} missing — ${item.problem}\n`);
        }
    }
    for (const [area, bucket] of [...areas].sort(([a], [b]) => a.localeCompare(b))) {
        process.stdout.write(`#   ${area}: ${bucket.done}/${bucket.done + bucket.open}\n`);
    }
    const missing = tasks.filter(task => task.missing);
    if (missing.length > 0) {
        process.stdout.write(`# ${missing.length} task(s) name an entry that is gone\n`);
    }
}

/** Refuse a plan whose tasks cannot be created, and report what is merely odd. */
function check(
    root: string,
    plan: IPlanDocument,
    flags: Set<string>,
    options: Map<string, string>,
): void {
    const entries = listEntries(root);
    const problems: string[] = [...plan.problems];
    const tasks = plan.tasks.map(task => {
        if (!task.id) {
            return {id: null, title: task.title, area: task.area ?? null, state: 'uncreated'};
        }
        const found = entryFor(entries, task.id);
        if (found.problem) problems.push(`line ${task.line + 1}: ${found.problem}`);
        if (found.entry && found.entry.title !== task.title) {
            problems.push(
                `line ${task.line + 1}: "${task.title}" and its entry say different things ` +
                    `("${found.entry.title}") — run \`plan sync\``,
            );
        }
        // The link is what makes the board navigable, so a task that names its entry without
        // one — or with a link that no longer reaches it — is drift `sync` repairs.
        if (found.entry) {
            const link = entryLink(root, plan.path, found.entry);
            if (task.link !== link) {
                problems.push(
                    `line ${task.line + 1}: "${task.title}" links to ` +
                        `${task.link ? `"${task.link}"` : 'nothing'} — run \`plan sync\``,
                );
            }
        }
        return {
            id: task.id,
            title: task.title,
            area: task.area ?? found.entry?.area ?? null,
            state: found.entry ? found.entry.status : 'missing',
        };
    });
    // A decision or friction the plan cites is part of its record; a citation that resolves to
    // nothing is the broken promise `memory refs --dangling` reports tree-wide, said here where the
    // author is looking.
    for (const item of supportingEntries(plan, entries)) {
        if (!item.entry) problems.push(`${item.id} is cited but ${item.problem}`);
    }

    if (on(flags, options, 'json')) {
        process.stdout.write(
            `${JSON.stringify({plan: relative(root, plan.path), tasks, problems}, null, 2)}\n`,
        );
    } else {
        for (const task of tasks) {
            process.stdout.write(
                `# ${task.id ?? '(uncreated)'} ${task.title} · ${task.area ?? '(no area)'} · ${task.state}\n`,
            );
        }
        for (const problem of problems) process.stderr.write(`blong-dev: ${problem}\n`);
        process.stdout.write(
            `# ${tasks.length} task(s), ${problems.length} problem(s) — ` +
                `${plan.meta.issueUrl ? 'issue linked' : 'no issue yet'}` +
                `${plan.meta.conversationId ? `, channel ${plan.meta.channelName}` : ', no channel'}\n`,
        );
    }
    if (problems.length > 0) process.exitCode = 1;
}

/** Create the memory entries and trim the plan. */
async function tasks(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): Promise<void> {
    const apply = on(flags, options, 'apply');
    const result = await createPlanTasks(root, plan, {
        apply,
        update: on(flags, options, 'update'),
        area: options.get('area'),
        slug: options.get('slug'),
    });
    for (const created of result.created) {
        process.stdout.write(
            `# ${apply ? created.id : '(new)'} ${created.task.title} · ${created.task.area}\n`,
        );
    }
    for (const updated of result.updated) {
        process.stdout.write(`# ${updated.id} updated from the plan\n`);
    }
    if (result.skipped > 0) {
        process.stdout.write(`# ${result.skipped} task(s) already carry an id\n`);
    }
    if (!apply) {
        process.stdout.write('# dry run — pass --apply to create the entries and trim the plan\n');
    } else {
        process.stdout.write(
            `# ${relative(root, result.plan.path)} trimmed to ${result.plan.tasks.length} title(s)\n`,
        );
    }
}

/** The repo an issue belongs in. */
function repoOf(root: string, options: Map<string, string>): string {
    const repo = options.get('repo')?.trim() || originRepo(root);
    if (!repo) {
        fail('no repository — pass --repo <owner/name> or give this checkout an origin remote');
    }
    return repo;
}

/** Parse `123` or an issue URL into a number. */
function issueNumberOf(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = /(?<number>\d+)\/?$/.exec(value.trim());
    return match ? Number(match.groups?.['number']) : undefined;
}

/** Publish the plan to its issue, creating it when there is none. */
function publishIssue(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): {number: number; url: string; repo: string} | undefined {
    if (on(flags, options, 'no-issue')) return undefined;
    if (!ghAvailable()) {
        process.stderr.write('blong-dev: `gh` is not installed — the issue was not published\n');
        return undefined;
    }
    const repo = repoOf(root, options);
    const title = planTitle(plan);
    if (!title) fail('the plan has no title — add a `title:` in its front matter or an H1');
    const slug = plan.meta.slug ?? planSlug(plan.path);
    const body = issueBody(issueLinks(bodyWithoutFrontMatter(plan), repo), slug);
    const label = options.get('label')?.trim() || 'plan';

    const existing =
        (plan.meta.issue ? {number: plan.meta.issue, url: plan.meta.issueUrl ?? ''} : undefined) ??
        issueFind(repo, title);
    if (existing && existing.number > 0) {
        issueEdit({repo, issue: existing.number, body, title});
        const url =
            existing.url ||
            issueFind(repo, title)?.url ||
            `https://github.com/${repo}/issues/${existing.number}`;
        return {number: existing.number, url, repo};
    }
    if (on(flags, options, 'dry-run')) {
        process.stdout.write(`# would create issue "${title}" in ${repo} with label ${label}\n`);
        return undefined;
    }
    labelEnsure(repo, label);
    const created = issueCreate({repo, title, body, labels: [label]});
    return {number: created.number, url: created.url, repo};
}

/** Approve the plan: tasks, issue and channel, recorded in the front matter. */
async function init(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): Promise<void> {
    const dryRun = on(flags, options, 'dry-run');
    let current = plan;

    if (!on(flags, options, 'no-tasks')) {
        const result = await createPlanTasks(root, current, {
            apply: !dryRun,
            area: options.get('area'),
            slug: options.get('slug') ?? planSlug(current.path),
        });
        current = result.plan;
        process.stdout.write(
            `# ${result.created.length} task(s) ${dryRun ? 'would be' : ''} created\n`,
        );
    }

    const slug = current.meta.slug ?? planSlug(current.path);
    const title = planTitle(current);
    const issue = publishIssue(root, current, options, flags);
    if (issue) process.stdout.write(`# ${issue.repo}#${issue.number} ${issue.url}\n`);

    let channel:
        | {platform: string; account: string; channelName: string; conversationId: string}
        | undefined;
    const recorded = options.get('channel')?.trim();
    if (recorded) {
        // A channel made outside this command — by a deployment that cannot open one, or by a
        // person — is recorded so the plan still has its address.
        channel = {
            platform: options.get('platform')?.trim() ?? current.meta.platform ?? 'slack',
            account: options.get('account')?.trim() ?? current.meta.account ?? 'blong-bot',
            channelName: options.get('channel-name')?.trim() ?? planChannelName(slug),
            conversationId: recorded,
        };
        process.stdout.write(
            `# channel ${channel.channelName} (${recorded}) recorded for ${channel.platform}/${channel.account}\n`,
        );
    } else if (!on(flags, options, 'no-slack') && !current.meta.conversationId) {
        try {
            channel = await createPlanChannel({
                slug,
                title,
                issueUrl: issue?.url ?? current.meta.issueUrl,
                platform: options.get('platform'),
                account: options.get('account'),
                invite: (options.get('invite') ?? '')
                    .split(',')
                    .map(value => value.trim())
                    .filter(Boolean),
                server: options.get('server'),
                target: options.get('target'),
                plain: on(flags, options, 'plain'),
                dryRun,
            });
            process.stdout.write(
                `# channel ${channel.channelName} (${channel.conversationId}) on ${channel.platform}/${channel.account}\n`,
            );
        } catch (error) {
            process.stderr.write(
                `blong-dev: the Slack channel was not created: ${(error as Error).message}\n`,
            );
        }
    } else if (current.meta.conversationId) {
        process.stdout.write(
            `# channel ${current.meta.channelName ?? '?'} (${current.meta.conversationId}) is already recorded\n`,
        );
    }

    if (dryRun) {
        process.stdout.write('# dry run — nothing was written\n');
        return;
    }

    const approved = !on(flags, options, 'draft');
    const channelUrl = channel
        ? planChannelUrl({
              platform: channel.platform,
              conversationId: channel.conversationId,
          })
        : (current.meta.channelUrl ??
          planChannelUrl({
              platform: current.meta.platform,
              conversationId: current.meta.conversationId,
          }));
    const patched = writeMeta(current, {
        slug,
        title,
        status: approved ? 'approved' : 'draft',
        repo: issue?.repo ?? current.meta.repo,
        ...(issue ? {issue: issue.number, issueUrl: issue.url} : {}),
        ...(channel
            ? {
                  platform: channel.platform,
                  account: channel.account,
                  channelName: channel.channelName,
                  conversationId: channel.conversationId,
                  ...(channelUrl ? {channelUrl} : {}),
              }
            : channelUrl
              ? {channelUrl}
              : {}),
        created: current.meta.created ?? new Date().toISOString().slice(0, 10),
        ...(approved ? {approved: new Date().toISOString().slice(0, 10)} : {}),
    });
    writeFileSync(patched.path, renderPlan(patched), 'utf8');
    process.stdout.write(
        `# ${relative(root, patched.path)} ${approved ? 'approved' : 'drafted'}\n`,
    );
}

/** Re-read the memory and make the plan (and its issue) say what the entries say. */
async function sync(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): Promise<void> {
    const entries = listEntries(root);
    const lines = [...plan.lines];
    let ticked = 0;
    let unticked = 0;
    let retitled = 0;
    let relinked = 0;
    let missing = 0;

    for (const task of plan.tasks) {
        if (!task.id) continue;
        const found = entryFor(entries, task.id);
        if (!found.entry) {
            missing += 1;
            process.stderr.write(`blong-dev: line ${task.line + 1}: ${found.problem}\n`);
            continue;
        }
        const done = isDone(found.entry);
        if (done !== task.checked) {
            if (done) ticked += 1;
            else unticked += 1;
        }
        if (found.entry.title !== task.title) retitled += 1;
        // The link carries the entry's own title, so a retitled entry needs a new anchor as
        // well as a new label; rewriting the whole line keeps the two in one place.
        const link = entryLink(root, plan.path, found.entry);
        if (task.link !== link) relinked += 1;
        lines[task.line] = renderTaskLine(
            {checked: done, id: task.id, title: found.entry.title},
            link,
        );
    }

    const updated: IPlanDocument = {...plan, lines};
    // A plan approved before the link was recorded gets it on the next sync, so the front
    // matter answers "where do I open the channel" without a second `plan init` (`@@D-813`).
    const channelUrl =
        updated.meta.channelUrl ??
        planChannelUrl({
            platform: updated.meta.platform,
            conversationId: updated.meta.conversationId,
        });
    const withMeta =
        channelUrl && channelUrl !== updated.meta.channelUrl
            ? writeMeta(updated, {channelUrl})
            : updated;
    // The decisions and frictions the plan lists were written when they were taken; the entry is
    // the record, so a retitled or closed one is re-rendered here (`@@D-815`).
    const section = refreshPlanEntries(
        withMeta,
        root,
        new Map(entries.map(entry => [entry.id, entry])),
    );
    for (const id of section.missing) {
        process.stderr.write(`blong-dev: ${id} is listed in the plan but has no memory entry\n`);
    }
    const current = section.doc;
    const changed = current.lines.some((line, index) => line !== plan.lines[index]);
    process.stdout.write(
        `# ${ticked} ticked, ${unticked} unticked, ${retitled} title(s) aligned` +
            `${relinked > 0 ? `, ${relinked} link(s) written` : ''}` +
            `${
                section.refreshed.length > 0
                    ? `, ${section.refreshed.length} entry line(s) refreshed`
                    : ''
            }` +
            `${
                missing + section.missing.length > 0
                    ? `, ${missing + section.missing.length} missing`
                    : ''
            }\n`,
    );
    if (on(flags, options, 'check')) {
        if (changed || missing > 0 || section.missing.length > 0) process.exitCode = 1;
        return;
    }
    if (changed) writeFileSync(current.path, renderPlan(current), 'utf8');

    if (!on(flags, options, 'no-issue') && current.meta.issue) {
        const issue = publishIssue(root, current, options, flags);
        if (issue) process.stdout.write(`# issue updated ${issue.url}\n`);
    }
    // A channel opened before its issue existed carries a topic with no link in it, and a
    // channel opened for a plan that was retitled carries the old title. The create is spent
    // (`name_taken`), so the topic is what this repairs (`@@D-812`).
    if (on(flags, options, 'channel') && current.meta.conversationId) {
        try {
            const topic = await updatePlanChannelTopic({
                platform: current.meta.platform,
                account: current.meta.account,
                conversationId: current.meta.conversationId,
                title: planTitle(current),
                issueUrl: current.meta.issueUrl,
                server: options.get('server'),
                target: options.get('target'),
                plain: on(flags, options, 'plain'),
            });
            process.stdout.write(`# channel topic \`${topic.topic}\`\n`);
        } catch (error) {
            process.stderr.write(
                `blong-dev: the channel topic was not updated: ${(error as Error).message}\n`,
            );
        }
    }
    if (on(flags, options, 'comment') && current.meta.issue) {
        const repo = current.meta.repo ?? repoOf(root, options);
        const done = current.tasks.filter(
            task => task.id && entries.some(entry => entry.id === task.id && isDone(entry)),
        ).length;
        try {
            issueComment(
                repo,
                current.meta.issue,
                `Progress: ${done}/${current.tasks.length} tasks done — ` +
                    '`blong-dev plan sync` after the next close.',
            );
        } catch (error) {
            process.stderr.write(
                `blong-dev: the progress comment failed: ${(error as Error).message}\n`,
            );
        }
    }
}

/** Put existing work under the plan. */
function adopt(
    root: string,
    plan: IPlanDocument,
    ids: string[],
    options: Map<string, string>,
): void {
    const issueValue = options.get('issue');
    if (ids.length === 0 && !issueValue) fail('plan adopt needs at least one id, or --issue <url>');

    let current = plan;
    if (issueValue) {
        const number = issueNumberOf(issueValue);
        if (!number) fail(`"${issueValue}" is not an issue number or URL`);
        const repo = options.get('repo')?.trim() || current.meta.repo || originRepo(root);
        const url = /^https?:\/\//.test(issueValue)
            ? issueValue
            : `https://github.com/${repo}/issues/${number}`;
        current = writeMeta(current, {issue: number, issueUrl: url, repo});
        process.stdout.write(`# adopted issue ${url}\n`);
    }

    const entries = listEntries(root);
    const lines = [...current.lines];
    const added: string[] = [];
    const listed: Array<{id: string; line: string}> = [];
    const already = new Set(current.tasks.map(task => task.id).filter(Boolean));
    for (const raw of ids) {
        const id = raw.trim().toUpperCase();
        if (!/^[FTD]-\d{3}$/.test(id)) fail(`"${raw}" is not a memory id`);
        if (already.has(id)) {
            process.stdout.write(`# ${id} is already in the plan\n`);
            continue;
        }
        const found = entryFor(entries, id);
        if (!found.entry) fail(found.problem ?? `no entry with id ${id}`);
        const entry = found.entry;
        if (entry.kind === 'todo') {
            added.push(
                renderTaskLine(
                    {checked: isDone(entry), id, title: entry.title},
                    entryLink(root, current.path, entry),
                ),
            );
        } else {
            // A decision or a friction is not work to tick: it belongs in the section the memory
            // tool maintains, where its status is kept in step with the entry (`@@D-815`).
            listed.push({id, line: planEntryLine(root, current.path, entry)});
        }
    }

    if (added.length > 0) {
        const lastTask = [...current.tasks].sort((a, b) => b.end - a.end)[0];
        if (lastTask) {
            const at = lastTask.end + 1;
            lines.splice(at, 0, ...added);
        } else {
            // No task yet: the lines belong under the work-breakdown heading, which keeps them
            // inside the section a reader looks at instead of after the considerations.
            const heading = lines.findIndex(line => /^##\s+.*work breakdown/i.test(line));
            if (heading === -1) {
                if (lines[lines.length - 1]?.trim() !== '') lines.push('');
                lines.push('## Adopted work', '', ...added, '');
            } else {
                let at = lines.length;
                for (let index = heading + 1; index < lines.length; index += 1) {
                    if (/^##\s/.test(lines[index] ?? '')) {
                        at = index;
                        break;
                    }
                }
                while (at - 1 > heading && (lines[at - 1] ?? '').trim() === '') at -= 1;
                // Replace the blank run that separated the section from the next heading, so the
                // inserted block does not leave two blank lines behind.
                let end = at;
                while (end < lines.length && (lines[end] ?? '').trim() === '') end += 1;
                lines.splice(at, end - at, '', ...added, '');
            }
        }
        current = {...current, lines};
        process.stdout.write(`${added.map(line => `# ${line.replace(/^- /, '')}`).join('\n')}\n`);
    }
    for (const item of listed) {
        current = addPlanEntry(current, item.id, item.line);
        process.stdout.write(`# ${item.id} listed under ${PLAN_ENTRIES_HEADING}\n`);
    }
    writeFileSync(current.path, renderPlan(current), 'utf8');
    process.stdout.write(`# ${relative(root, current.path)} updated\n`);
}

export async function plan(args: string[]): Promise<void> {
    const parsed = parseArgs(guardBooleans(args));
    const root = repoRoot(process.cwd());
    const [verb, ...rest] = parsed.positionals;
    const {options, flags} = parsed;

    try {
        switch (verb) {
            case 'check': {
                const doc = loadRaw(root, rest[0]);
                check(root, doc, flags, options);
                return;
            }
            case 'status': {
                const doc = loadRaw(root, rest[0]);
                status(root, doc, flags, options);
                return;
            }
            case 'tasks': {
                const doc = load(root, rest[0]);
                await tasks(root, doc, options, flags);
                return;
            }
            case 'init': {
                const doc = load(root, rest[0]);
                await init(root, doc, options, flags);
                return;
            }
            case 'sync': {
                const doc = load(root, rest[0]);
                await sync(root, doc, options, flags);
                return;
            }
            case 'adopt': {
                const doc = load(root, rest[0]);
                adopt(root, doc, rest.slice(1), options);
                return;
            }
            default:
                fail(`unknown plan verb "${verb ?? ''}"`);
        }
    } catch (error) {
        if (error instanceof UsageError) {
            const hintVerb = verb !== undefined && PLAN_VERBS.has(verb) ? verb : undefined;
            process.stderr.write(
                `blong-dev plan: ${error.message}\n${usageHint('plan', hintVerb)}\n`,
            );
            process.exitCode = 1;
            return;
        }
        throw error;
    }
}
