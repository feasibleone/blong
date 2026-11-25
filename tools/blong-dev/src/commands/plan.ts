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
 *   with `@@T-` references. `--apply` is the write; a dry run is the default. The decisions
 *   listed under `### Decisions this plan takes` are created in the same run, because a
 *   planning decision is what the tasks rest on (@@D-861).
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

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import {join, relative, resolve} from 'node:path';

import {loadCallRc} from '../callRc.ts';
import {listEntries, type IMemoryEntryView} from '../memory/memoryView.ts';
import {
    claimLabelsChange,
    ghAvailable,
    ghLogin,
    issueBody,
    issueComment,
    issueCreate,
    issueEdit,
    issueFind,
    issueFrontMatter,
    issueTrack,
    issueView,
    labelEnsure,
    originRepo,
    stripIssueHeader,
} from '../plan/planGithub.ts';
import {planFiles, plansRoot, readActivePlan, writeActivePlan} from '../plan/planLink.ts';
import {entryLink, issueLinks} from '../plan/planLinks.ts';
import {
    CLAIM_FIELDS,
    CLAIM_LABEL,
    claimOf,
    claimPatch,
    isHostLabel,
    isMine,
    parseClaimMarker,
    thisHost,
    today,
    type IPlanClaim,
} from '../plan/planOwnership.ts';
import {
    blockIsRendered,
    bodyWithoutFrontMatter,
    frontMatterWithout,
    parsePlan,
    planText,
    planTitle,
    positionalTitle,
    readPlan,
    renderDecisionBlock,
    renderPlan,
    renderTaskBlock,
    spaceOutPlan,
    writeMeta,
    type IPlanDocument,
    type IPlanMeta,
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
import type {IPlanIssueRef} from '../plan/planTasks.ts';
import {
    createPlanDecisions,
    createPlanTasks,
    planIssue,
    planSlug,
    provenanceLine,
} from '../plan/planTasks.ts';
import {repoRoot} from '../report/reportPaths.ts';
import {usageHint} from '../usage.ts';
import {UsageError} from '../utils/usageError.ts';
import {parseArgs} from './log.ts';

/** The verbs {@link usageHint} may name when a call fails. */
const PLAN_VERBS = new Set([
    'check',
    'tasks',
    'init',
    'sync',
    'status',
    'adopt',
    'claim',
    'release',
]);

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
    'no-decisions',
    'no-claim',
    'force',
    'remove',
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

/**
 * The file a plan argument names, or `undefined` when it names nothing on this disk.
 *
 * The same three forms `resolvePlanFile` accepts, without the refusal: `plan claim` needs to know
 * whether an argument is a plan or an issue, and only the caller can say what to do when it is
 * neither.
 */
export function findPlanFile(root: string, argument: string | undefined): string | undefined {
    if (argument) {
        const direct = resolve(argument);
        if (existsSync(direct)) return statSync(direct).isDirectory() ? onlyPlanIn(direct) : direct;
        const inPlans = join(plansRoot(root), argument);
        if (existsSync(inPlans)) {
            return statSync(inPlans).isDirectory() ? onlyPlanIn(inPlans) : inPlans;
        }
        const withExtension = join(plansRoot(root), `${argument}.md`);
        return existsSync(withExtension) ? withExtension : undefined;
    }
    const files = planFiles(root);
    return files.length === 1 ? files[0] : undefined;
}

/** The file a plan argument names. */
export function resolvePlanFile(root: string, argument: string | undefined): string {
    const found = findPlanFile(root, argument);
    if (found !== undefined) return found;
    if (argument) {
        fail(`no plan at "${argument}" — it is a file, a folder under plans/, or a folder name`);
    }
    const files = planFiles(root);
    if (files.length === 0) fail('there is no plan under plans/ — name one');
    fail(`name a plan: ${files.map(file => relative(root, file)).join(', ')}`);
}

/** The single markdown file of a plan folder, preferring `plan.md`. */
function onlyPlanIn(dir: string): string {
    for (const name of ['plan.md', 'PLAN.md']) {
        const path = join(dir, name);
        if (existsSync(path)) return path;
    }
    // A `plan.prompt.md` is not a plan: it is the request a plan answers, and it stays beside the
    // plan after a release removes the board (`planLink.planFiles` makes the same distinction).
    const markdown = readdirSync(dir)
        .filter(name => name.toLowerCase().endsWith('.md'))
        .filter(name => !name.toLowerCase().endsWith('.prompt.md'));
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
            [...text.matchAll(/@@(?<id>[FD]-\d{3,})/g)].map(match => match.groups?.['id'] ?? ''),
        ),
    ].filter(Boolean);
    return ids.map(id => ({id, ...entryFor(entries, id)}));
}

/**
 * The local plan a published issue number names.
 *
 * `plan claim <issue>` rebuilds a plan from its issue, so the two handles name one plan and only
 * the caller knows which one it was given: release accepts both, and after a claim the number is
 * the handle a person still has at hand.
 */
function findPlanByIssue(root: string, argument: string | undefined): string | undefined {
    const digits = argument?.trim().replace(/^#/, '');
    if (!digits || !/^\d+$/.test(digits)) return undefined;
    const number = Number(digits);
    return planFiles(root).find(file => readPlan(file).meta.issue === number);
}

/** Read a plan, refusing one the parser could not describe. */
function load(root: string, argument: string | undefined): IPlanDocument {
    return loadAt(resolvePlanFile(root, argument));
}

/** Read a plan by the file it lives in, refusing one the parser could not describe. */
function loadAt(path: string): IPlanDocument {
    const doc = readPlan(path);
    if (doc.problems.length > 0) {
        fail(`the plan has problems:\n${doc.problems.map(line => `  ${line}`).join('\n')}`);
    }
    return doc;
}

/** Read a plan as it is, problems and all, for the verbs whose job is to report them. */
function loadRaw(root: string, argument: string | undefined): IPlanDocument {
    return readPlan(resolvePlanFile(root, argument));
}

/** The host a run acts as: `--host` names it, for a test or a second checkout on one machine. */
function hostOf(options: Map<string, string>): string {
    const named = options.get('host')?.trim();
    return named !== undefined && named !== '' ? named : thisHost();
}

/**
 * Refuse a plan another host holds, and say so when no host holds it at all.
 *
 * The claim exists because a plan is a local folder: two hosts working one plan edit two memory
 * trees that only agree by accident, and neither can see the other's `memory close`. A mutating
 * verb on a plan another host holds is therefore an error rather than a warning, and `--force` is
 * the sentence that says the operator knows (`@@D-967`).
 */
function assertOwned(
    root: string,
    plan: IPlanDocument,
    verb: string,
    options: Map<string, string>,
    flags: Set<string>,
): IPlanClaim | undefined {
    const host = hostOf(options);
    const claim = claimOf(plan.meta);
    if (claim && !isMine(claim, host)) {
        if (!on(flags, options, 'force')) {
            fail(
                `this plan is claimed by "${claim.host}"${claim.at ? ` since ${claim.at}` : ''} — ` +
                    `\`${verb}\` would edit the memory files that host is working. Release it ` +
                    'there (`blong-dev plan release <plan>`) before taking it, or pass --force.',
            );
        }
        process.stdout.write(`# --force: taking over a plan claimed by "${claim.host}"\n`);
    }
    if (!claim) {
        process.stdout.write(
            `# note: no host has claimed this plan — \`blong-dev plan claim ${planSlug(
                plan.path,
            )}\` records that it is being worked here\n`,
        );
    }
    return claim;
}

/** What a published issue says about the plan: its claim, and the labels it carries. */
function issueState(root: string, plan: IPlanDocument): {claim?: IPlanClaim; labels: string[]} {
    const number = plan.meta.issue;
    const empty: {claim?: IPlanClaim; labels: string[]} = {labels: []};
    if (!number || !ghAvailable()) return empty;
    const repo = plan.meta.repo ?? originRepo(root);
    if (!repo) return empty;
    const state = issueView(repo, number);
    if (!state) return empty;
    const claim = state.body ? parseClaimMarker(state.body) : undefined;
    return {labels: state.labels ?? [], ...(claim ? {claim} : {})};
}

/**
 * Point the entries a plan created at its issue.
 *
 * The provenance sentence is what an entry says to explain itself. While the plan is unpublished it
 * names the folder, which is the only record there is; once the issue exists it names the issue,
 * because that is what any reader can open and what says whether a local copy still exists — the
 * same reason a release rewrites the sentence when it removes the file (`@@D-967`). Only that exact
 * sentence is replaced: an entry that mentions the plan in prose keeps its words.
 */
function rewriteProvenance(root: string, slug: string, issue: IPlanIssueRef | undefined): number {
    const sentence = provenanceLine(slug);
    const replacement = issue
        ? provenanceLine(slug, issue)
        : 'Planned in a plan folder whose `plan.md` has since been removed.';
    let changed = 0;
    for (const path of new Set(listEntries(root).map(entry => entry.path))) {
        const file = join(root, path);
        if (!existsSync(file)) continue;
        const text = readFileSync(file, 'utf8');
        if (!text.includes(sentence)) continue;
        writeFileSync(file, text.split(sentence).join(replacement), 'utf8');
        changed += 1;
    }
    return changed;
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
    const claim = claimOf(plan.meta);
    process.stdout.write(
        claim
            ? `# claimed: ${claim.host}${claim.by ? ` (${claim.by})` : ''} since ${claim.at || 'an unrecorded day'}${isMine(claim, hostOf(options)) ? '' : ' — not this host'}\n`
            : '# claimed: nobody\n',
    );
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
    // A decision the plan takes is created with the tasks, so an uncreated one is the same problem a
    // task without an id is: the plan is not published yet. Drift is reported the way a task's is,
    // because `sync` repairs both (@@D-861).
    const decisions = plan.decisions.map(decision => {
        if (!decision.id) {
            problems.push(
                `line ${decision.line + 1}: decision "${decision.title}" has no @@D- id — ` +
                    'run `plan init`',
            );
            return {id: null, title: decision.title, state: 'uncreated'};
        }
        const found = entryFor(entries, decision.id);
        if (found.problem) {
            problems.push(`line ${decision.line + 1}: ${found.problem}`);
            return {id: decision.id, title: decision.title, state: 'missing'};
        }
        if (found.entry && found.entry.title !== decision.title) {
            problems.push(
                `line ${decision.line + 1}: decision "${decision.title}" and its entry say ` +
                    `different things ("${found.entry.title}") — run \`plan sync\``,
            );
        }
        if (found.entry) {
            const link = entryLink(root, plan.path, found.entry);
            if (decision.link !== link) {
                problems.push(
                    `line ${decision.line + 1}: decision "${decision.title}" links to ` +
                        `${decision.link ? `"${decision.link}"` : 'nothing'} — run \`plan sync\``,
                );
            }
        }
        return {
            id: decision.id,
            title: decision.title,
            state: found.entry ? found.entry.status : 'missing',
        };
    });
    // A decision or friction the plan cites is part of its record; a citation that resolves to
    // nothing is the broken promise `memory refs --dangling` reports tree-wide, said here where the
    // author is looking.
    for (const item of supportingEntries(plan, entries)) {
        if (!item.entry) problems.push(`${item.id} is cited but ${item.problem}`);
    }

    // A title is the handle the entry is found by, so it has to survive being read on its own: a
    // positional one says nothing two plans apart, and one that repeats an existing entry's title
    // leaves two entries nobody can tell apart. Both are reported rather than refused — the plan is
    // still executable, and an old plan is not worth rewriting for a name (@@D-863).
    const notes: string[] = [];
    const held = claimOf(plan.meta);
    if (held && !isMine(held, hostOf(options))) {
        notes.push(
            `this plan is claimed by "${held.host}" — work it there, or release it before taking it`,
        );
    }
    const items = [
        ...plan.tasks.map(task => ({title: task.title, line: task.line, id: task.id})),
        ...plan.decisions.map(decision => ({
            title: decision.title,
            line: decision.line,
            id: decision.id,
        })),
    ];
    for (const item of items) {
        const positional = positionalTitle(item.title);
        if (positional) {
            notes.push(
                `line ${item.line + 1}: "${item.title}" ${positional} — name what it proves, ` +
                    'e.g. "Verify a mismatched content type answers 415"',
            );
        }
        if (item.id) continue;
        const clash = entries.find(entry => entry.title === item.title);
        if (clash) {
            notes.push(
                `line ${item.line + 1}: "${item.title}" is already ${clash.id}'s title ` +
                    `(${clash.path}) — the two entries cannot be told apart`,
            );
        }
    }

    if (on(flags, options, 'json')) {
        process.stdout.write(
            `${JSON.stringify({plan: relative(root, plan.path), tasks, decisions, problems, notes}, null, 2)}\n`,
        );
    } else {
        for (const task of tasks) {
            process.stdout.write(
                `# ${task.id ?? '(uncreated)'} ${task.title} · ${task.area ?? '(no area)'} · ${task.state}\n`,
            );
        }
        for (const decision of decisions) {
            process.stdout.write(
                `# ${decision.id ?? '(uncreated)'} ${decision.title} · decision · ${decision.state}\n`,
            );
        }
        for (const note of notes) process.stdout.write(`# note: ${note}\n`);
        for (const problem of problems) process.stderr.write(`blong-dev: ${problem}\n`);
        process.stdout.write(
            `# ${tasks.length} task(s), ${decisions.length} decision(s), ` +
                `${problems.length} problem(s)` +
                `${notes.length > 0 ? `, ${notes.length} note(s)` : ''} — ` +
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
    if (apply) assertOwned(root, plan, 'plan tasks --apply', options, flags);
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

    // The decisions the plan takes are entries for the same reason the tasks are: a decision is what
    // a later task, comment or doc cites, and prose cannot be cited (@@D-861).
    let current = result.plan;
    if (!on(flags, options, 'no-decisions')) {
        const decisions = await createPlanDecisions(root, current, {
            apply,
            update: on(flags, options, 'update'),
            area: options.get('area'),
            slug: options.get('slug'),
        });
        current = decisions.plan;
        for (const created of decisions.created) {
            process.stdout.write(
                `# ${apply ? created.id : '(new)'} ${created.decision.title} · ` +
                    `${created.decision.area}\n`,
            );
        }
        for (const updated of decisions.updated) {
            process.stdout.write(`# ${updated.id} updated from the plan\n`);
        }
        if (decisions.skipped > 0) {
            process.stdout.write(`# ${decisions.skipped} decision(s) already carry an id\n`);
        }
    }

    if (!apply) {
        process.stdout.write('# dry run — pass --apply to create the entries and trim the plan\n');
    } else {
        process.stdout.write(
            `# ${relative(root, current.path)} trimmed to ${current.tasks.length} task(s), ` +
                `${current.decisions.length} decision(s)\n`,
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
/** The labels an issue carries now, or nothing when it cannot be read. */
function claimLabelsPresent(repo: string, issue: number): string[] {
    return issueView(repo, issue)?.labels ?? [];
}

/**
 * Put the claim on an issue as labels, creating the labels the repository does not have yet.
 *
 * A label that does not exist makes `gh issue edit --add-label` fail, and a claim that silently loses
 * its visible mark is worse than one with no label at all (`@@D-967`).
 */
function claimLabelsApply(repo: string, issue: number, claim: IPlanClaim, present: string[]): void {
    const change = claimLabelsChange(claim, present);
    labelEnsure(repo, CLAIM_LABEL);
    labelEnsure(repo, change.wanted, `Plan claimed by the host \`${claim.host}\``, '0E8A16');
    issueTrack(repo, issue, {
        addLabels: change.add,
        ...(change.remove.length > 0 ? {removeLabels: change.remove} : {}),
        ...(change.assignee ? {assignee: change.assignee} : {}),
    });
}

/**
 * The issue a plan is published to, kept in step with the plan file.
 *
 * The claim travels twice: as the marker in the body, which a host reads back, and as the labels,
 * which is what the issue list shows. Both are applied here rather than in `plan claim` alone, because
 * `plan init` publishes a claimed plan — the first publication was the path that skipped the labels,
 * and an issue whose body says claimed while every list says otherwise is the one state the list
 * cannot show (`@@D-967`).
 */
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
    const claim = claimOf(plan.meta);
    const body = issueBody(issueLinks(bodyWithoutFrontMatter(plan), repo), slug, {
        ...(claim ? {claim} : {}),
        ...(typeof plan.meta.localRemovedAt === 'string'
            ? {removedAt: plan.meta.localRemovedAt}
            : {}),
        // What a rebuild cannot invent: the approval and close dates, the Slack channel, a summary.
        // The claim and the removal date are left out because the header already says both.
        frontMatter: frontMatterWithout(plan, [...CLAIM_FIELDS, 'localRemovedAt']),
    });
    const label = options.get('label')?.trim() || 'plan';

    const existing =
        (plan.meta.issue ? {number: plan.meta.issue, url: plan.meta.issueUrl ?? ''} : undefined) ??
        issueFind(repo, title);
    if (existing && existing.number > 0) {
        issueEdit({repo, issue: existing.number, body, title});
        if (claim) {
            const present = claimLabelsPresent(repo, existing.number);
            if (!claimLabelsChange(claim, present).holds)
                claimLabelsApply(repo, existing.number, claim, present);
        }
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
    // The label goes on at creation, in a second call rather than in this one, so a claim the
    // repository has never seen is created with its description and colour instead of being added
    // by name and left bare.
    if (claim && created.number > 0) claimLabelsApply(repo, created.number, claim, []);
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

    if (!on(flags, options, 'no-decisions')) {
        const result = await createPlanDecisions(root, current, {
            apply: !dryRun,
            area: options.get('area'),
            slug: options.get('slug') ?? planSlug(current.path),
        });
        current = result.plan;
        process.stdout.write(
            `# ${result.created.length} decision(s) ${dryRun ? 'would be' : ''} created\n`,
        );
    }

    // A plan is claimed by the host that publishes it: from here on the local folder is the source
    // and no other host may edit the memory it drives. The claim goes into the document before the
    // issue is published, so the body carries its marker in the same write (`@@D-967`).
    let claim: IPlanClaim | undefined;
    if (!on(flags, options, 'no-claim')) {
        // The login is only asked for when there is an issue to publish to: a run that skips the
        // issue must not wait on a network call to record a claim.
        const by = on(flags, options, 'no-issue') ? undefined : ghLogin();
        claim = {host: hostOf(options), at: today(), ...(by ? {by} : {})};
        current = writeMeta(current, claimPatch(claim));
    }

    const slug = current.meta.slug ?? planSlug(current.path);
    const title = planTitle(current);
    const issue = publishIssue(root, current, options, flags);
    if (issue) process.stdout.write(`# ${issue.repo}#${issue.number} ${issue.url}\n`);
    // The entries created above name the plan file, because that was the only record when they were
    // written; now the plan has an issue, and that is what any reader can open (`@@D-967`).
    if (issue) {
        const rewritten = rewriteProvenance(root, slug, {number: issue.number, url: issue.url});
        if (rewritten > 0) {
            process.stdout.write(`# ${rewritten} memory file(s) now name the issue\n`);
        }
    }

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
        const invite = (options.get('invite') ?? '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);
        // The id is a fact about the person, not about the plan, so the file may carry it once
        // (`plan.invite`) and every plan afterwards inherits it instead of forgetting it.
        const fromRc = invite.length === 0 ? (loadCallRc()?.config.plan?.invite ?? []) : [];
        const invited = invite.length > 0 ? invite : fromRc;
        // A private channel invites nobody unless it is told who, and nobody means the owner cannot
        // see the conversation the plan asks its questions in. Slack answers `name_taken` for the
        // name afterwards and the chat realm has no route that invites into an existing channel, so
        // this is the only moment the invitation can be made — say so rather than creating a channel
        // nobody can open.
        if (invited.length === 0 && !dryRun) {
            process.stderr.write(
                'blong-dev: the channel will be created with no invite — a private channel nobody ' +
                    'is invited to is invisible to the owner, and the name cannot be re-created ' +
                    'afterwards. Pass --invite <slackUserId,...> (the member id, not the email).\n',
            );
        }
        try {
            channel = await createPlanChannel({
                slug,
                title,
                issueUrl: issue?.url ?? current.meta.issueUrl,
                platform: options.get('platform'),
                account: options.get('account'),
                invite: invited,
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
    // The plan being executed is a fact on disk from here on: a decision or a friction the work
    // produces must say whether it belongs to this plan, and `memory add` refuses to guess
    // (@@D-916). A draft is not recorded, and neither is a plan nobody claimed — nothing is being
    // executed until a host holds it (`@@D-967`).
    if (approved && claim) writeActivePlan(root, {slug, path: relative(root, patched.path)});
    process.stdout.write(
        `# ${relative(root, patched.path)} ${approved ? 'approved' : 'drafted'}\n`,
    );
    if (claim && approved) {
        process.stdout.write(
            `# claimed by ${claim.host}${claim.by ? ` (${claim.by})` : ''} on ${claim.at}\n`,
        );
    }
}

/** Re-read the memory and make the plan (and its issue) say what the entries say. */
async function sync(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): Promise<void> {
    assertOwned(root, plan, 'plan sync', options, flags);
    const entries = listEntries(root);
    const lines = [...plan.lines];
    let ticked = 0;
    let unticked = 0;
    let retitled = 0;
    let relinked = 0;
    let missing = 0;
    let decisionsAligned = 0;
    /** Every item whose block has to be rewritten, collected first and applied bottom-up. */
    const edits: Array<{
        item: {line: number; end: number; body: string[]; title: string};
        rendered: string[];
        decision: boolean;
    }> = [];

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
        edits.push({
            item: task,
            rendered: renderTaskBlock({checked: done, id: task.id, title: found.entry.title}, link),
            decision: false,
        });
    }

    // A decision's line is its link and its title, so a retitled or re-anchored entry is re-rendered
    // here exactly as a task's is — the plan is the board for both (@@D-861).
    for (const decision of plan.decisions) {
        if (!decision.id) continue;
        const found = entryFor(entries, decision.id);
        if (!found.entry) {
            missing += 1;
            process.stderr.write(`blong-dev: line ${decision.line + 1}: ${found.problem}\n`);
            continue;
        }
        edits.push({
            item: decision,
            rendered: renderDecisionBlock(
                {id: decision.id, title: found.entry.title},
                entryLink(root, plan.path, found.entry),
            ),
            decision: true,
        });
    }

    // Bottom-up: a block written as two lines where one was before moves every line below it, so the
    // indexes a forward walk holds would go stale.
    for (const edit of [...edits].sort((a, b) => b.item.line - a.item.line)) {
        const {item, rendered, decision} = edit;
        const already =
            item.body.length === 0 &&
            blockIsRendered(lines.slice(item.line, item.end + 1), rendered);
        if (already) continue;
        // A block is replaced whole rather than line by line: an earlier render can leave a
        // repetition of the title under the link, and rewriting only the first line would keep it
        // forever (@@F-768). The blank after the block belongs to a heading, not to an item, so
        // consecutive tasks stay tight and render as one list.
        const next = lines[item.end + 1];
        const heading = next !== undefined && /^#{1,6}\s/.test(next);
        lines.splice(item.line, item.end - item.line + 1, ...rendered, ...(heading ? [''] : []));
        if (decision) decisionsAligned += 1;
    }

    const updated: IPlanDocument = {...plan, lines: spaceOutPlan(lines)};
    // Refreshed on every sync: a plan re-approved after a rename, or one resumed after another was
    // finished, is the active one — and `memory add` reads this rather than scanning (@@D-916). Only
    // a plan this host claims is being executed (`@@D-967`).
    if (updated.meta.status === 'approved' && claimOf(updated.meta)?.host === hostOf(options)) {
        writeActivePlan(root, {slug: updated.meta.slug ?? '', path: relative(root, plan.path)});
    }
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
            `${decisionsAligned > 0 ? `, ${decisionsAligned} decision(s) aligned` : ''}` +
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
    // An entry that still names the plan file is rewritten to name the issue: the plan may be
    // released at any time, and the issue is the record that survives (`@@D-967`).
    if (!on(flags, options, 'check') && current.meta.issueUrl) {
        const changed = rewriteProvenance(
            root,
            current.meta.slug ?? planSlug(current.path),
            planIssue(current),
        );
        if (changed > 0) process.stdout.write(`# ${changed} memory file(s) now name the issue\n`);
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
    flags: Set<string>,
): void {
    const issueValue = options.get('issue');
    if (ids.length === 0 && !issueValue) fail('plan adopt needs at least one id, or --issue <url>');
    assertOwned(root, plan, 'plan adopt', options, flags);

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
        if (!/^[FTD]-\d{3,}$/.test(id)) fail(`"${raw}" is not a memory id`);
        if (already.has(id)) {
            process.stdout.write(`# ${id} is already in the plan\n`);
            continue;
        }
        const found = entryFor(entries, id);
        if (!found.entry) fail(found.problem ?? `no entry with id ${id}`);
        const entry = found.entry;
        if (entry.kind === 'todo') {
            added.push(
                ...renderTaskBlock(
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

/**
 * Take the plan for this host, so no other one edits the memory it drives.
 *
 * The plan is a local folder and the folder is gitignored, so a claim recorded in the front matter
 * is only a copy: the issue is where two hosts can see each other, and a claim already published
 * there wins over this checkout's front matter. A stale copy must never take a plan somebody else is
 * working, which is why the refusal comes from the marker and not from the file.
 */
/** The GitHub issue an argument names, with the repository it lives in. */
export function parseIssueArgument(
    root: string,
    argument: string | undefined,
    options: Map<string, string>,
): {repo: string; number: number} | undefined {
    const text = (argument ?? '').trim();
    const url =
        /^https?:\/\/github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+)\/issues\/(?<number>\d+)\/?$/.exec(
            text,
        );
    if (url?.groups) {
        return {
            repo: `${url.groups['owner']}/${url.groups['name']}`,
            number: Number(url.groups['number']),
        };
    }
    const bare = /^#?(?<number>\d+)$/.exec(text);
    if (!bare?.groups) return undefined;
    const repo = options.get('repo')?.trim() || originRepo(root);
    return repo === undefined ? undefined : {repo, number: Number(bare.groups['number'])};
}

/**
 * The folder name a plan's title suggests.
 *
 * A recovered plan has no folder name to take: the issue carries a title and nothing else. The part
 * before the first dash or colon is what a plan is usually named after (`blong-chat — …`), so that
 * is the guess; `--slug` is there for the titles the guess gets wrong.
 */
export function slugFromTitle(title: string): string {
    const head = title.split(/\s+[—–-]\s+|:\s+/)[0] ?? title;
    const slug = head
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
        .replace(/-$/, '');
    return slug === '' ? 'plan' : slug;
}

/**
 * Rebuild a plan from its published issue and claim it.
 *
 * A plan's folder lives on the host that created it, so a second host has the issue and nothing else.
 * The issue body is the plan without its front matter, behind the sentences that say where the plan
 * is worked — so taking the plan over is: read the issue, strip the header, write the folder under a
 * slug the title suggests, and then claim the file the way any other claim does. The front matter
 * comes back from the comment the issue carries, because the issue is the source of record and the
 * approval date, the Slack channel and a `closed` status are nowhere else (@@T-761); an issue
 * published before that comment existed rebuilds from defaults, and the run says so. What does not
 * travel is said rather than assumed: the support files beside the plan (`plan.prompt.md`,
 * `model.md`) are not in the issue, and a body GitHub truncated comes back partial (`@@T-759`).
 */
function claimFromIssue(
    root: string,
    argument: string | undefined,
    options: Map<string, string>,
    flags: Set<string>,
): void {
    if (!argument) {
        fail('name a plan, or the issue a plan is published in');
    }
    const target = parseIssueArgument(root, argument, options);
    if (!target) {
        fail(
            `"${argument}" is neither a plan on this disk nor a GitHub issue — pass a plan, or ` +
                'https://github.com/<owner>/<name>/issues/<n> (a bare number needs --repo)',
        );
    }
    if (!ghAvailable()) {
        fail('`gh` is not installed — an issue cannot be read without it');
    }
    const issue = issueView(target.repo, target.number);
    if (!issue || typeof issue.body !== 'string') {
        fail(`issue ${target.repo}#${target.number} could not be read`);
    }
    const body = stripIssueHeader(issue.body!);
    if (body.trim() === '') {
        fail(`issue ${target.repo}#${target.number} carries no plan body to rebuild from`);
    }
    if (/Truncated at GitHub's issue-body limit/.test(body)) {
        process.stderr.write(
            'blong-dev: the issue body was truncated at GitHub’s limit — the recovered plan is ' +
                'partial\n',
        );
    }
    const title = issue.title?.trim() || `Plan ${target.repo}#${target.number}`;
    const slug = options.get('slug')?.trim() || slugFromTitle(title);
    const path = join(plansRoot(root), slug, 'plan.md');
    if (existsSync(path)) {
        fail(`plans/${slug}/plan.md already exists — pass --slug <name> to rebuild it elsewhere`);
    }
    const url = issue.url ?? `https://github.com/${target.repo}/issues/${target.number}`;
    const published = issueFrontMatter(issue.body!);
    if (published === undefined) {
        process.stderr.write(
            'blong-dev: the issue carries no front matter — the rebuild uses defaults ' +
                '(status: approved, today as the recovered date)\n',
        );
    }
    // The issue's own coordinates and the claim are decided here, not carried over: a rebuild names
    // the folder it writes and starts unclaimed, and the claim that follows is what records a host.
    const meta: IPlanMeta = published ? parsePlan(`---\n${published}\n---\n`).meta : {};
    for (const key of [...CLAIM_FIELDS, 'localRemovedAt']) delete meta[key];
    meta.slug = slug;
    meta.title = meta.title ?? title;
    meta.status = meta.status ?? 'approved';
    meta.repo = target.repo;
    meta.issue = target.number;
    meta.issueUrl = url;
    meta.recoveredAt = today();
    mkdirSync(join(plansRoot(root), slug), {recursive: true});
    writeFileSync(path, planText(meta, body), 'utf8');
    process.stdout.write(`# ${relative(root, path)} rebuilt from ${url}\n`);
    claim(root, readPlan(path), options, flags);
}

function claim(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): void {
    const host = hostOf(options);
    const force = on(flags, options, 'force');
    const remote = issueState(root, plan);
    const local = claimOf(plan.meta);
    const held =
        remote.claim && !isMine(remote.claim, host)
            ? remote.claim
            : local && !isMine(local, host)
              ? local
              : undefined;
    if (held && !force) {
        fail(
            `this plan is claimed by "${held.host}"${held.at ? ` since ${held.at}` : ''} — ` +
                'release it there (`blong-dev plan release <plan>`) before taking it, or pass ' +
                '--force.',
        );
    }
    if (held) process.stdout.write(`# --force: taking over a plan claimed by "${held.host}"\n`);

    const number = plan.meta.issue;
    // The login only matters where it is published: a local-only plan must not wait on a network
    // call to record a claim.
    const by = number && !on(flags, options, 'no-issue') ? ghLogin() : undefined;
    const taken: IPlanClaim = {host, at: today(), ...(by ? {by} : {})};
    const patched = writeMeta(plan, claimPatch(taken));
    writeFileSync(patched.path, renderPlan(patched), 'utf8');
    // Only a plan being executed is the active one, so a claim on an approved plan is what
    // `memory add` reads when it asks which plan a decision belongs to (`@@D-916`).
    if (patched.meta.status === 'approved') {
        writeActivePlan(root, {
            slug: patched.meta.slug ?? planSlug(patched.path),
            path: relative(root, patched.path),
        });
    }
    process.stdout.write(`# claimed by ${host}${by ? ` (${by})` : ''} on ${taken.at}\n`);

    const repo = patched.meta.repo ?? originRepo(root);
    if (number && !on(flags, options, 'no-issue')) {
        if (!repo || !ghAvailable()) {
            process.stderr.write(
                'blong-dev: the issue was not updated — the claim holds on this checkout only\n',
            );
        } else {
            claimLabelsApply(repo, number, taken, remote.labels);
            publishIssue(root, patched, options, flags);
        }
    }
}

/**
 * Let the plan go, and optionally take the local `plan.md` with it.
 *
 * Releasing is the other half of a claim: a finished or suspended plan is nobody's, so another host
 * may take it and the checkout that wrote it may drop the board. `--remove` deletes the plan file;
 * entries it created already name the issue once the plan has one, and any that still name the file
 * are rewritten as the file goes. The folder itself stays, with whatever support files it holds.
 */
function release(
    root: string,
    plan: IPlanDocument,
    options: Map<string, string>,
    flags: Set<string>,
): void {
    const host = hostOf(options);
    const force = on(flags, options, 'force');
    const claim = claimOf(plan.meta);
    if (claim && !isMine(claim, host) && !force) {
        fail(
            `this plan is claimed by "${claim.host}"${claim.at ? ` since ${claim.at}` : ''} — ` +
                'only that host releases it, or pass --force.',
        );
    }
    const remove = on(flags, options, 'remove');
    const number = plan.meta.issue;
    const repo = plan.meta.repo ?? originRepo(root);
    if (remove && !number && !force) {
        fail(
            '--remove deletes the local plan, and without a published issue nothing of it would ' +
                'be left — publish it first (`plan init`), or pass --force.',
        );
    }

    const slug = plan.meta.slug ?? planSlug(plan.path);
    const active = readActivePlan(root);
    const released = writeMeta(plan, {}, CLAIM_FIELDS);
    let published = released;
    if (remove) {
        const rewritten = rewriteProvenance(root, slug, planIssue(plan));
        published = writeMeta(released, {localRemovedAt: today()});
        unlinkSync(released.path);
        process.stdout.write(
            `# ${relative(root, released.path)} removed — ${rewritten} memory file(s) now name ` +
                'the issue\n',
        );
    } else {
        writeFileSync(released.path, renderPlan(released), 'utf8');
    }
    if (active && (active.slug === slug || active.path === relative(root, plan.path))) {
        writeActivePlan(root, undefined);
    }
    process.stdout.write(`# released${claim ? ` (was claimed by ${claim.host})` : ''}\n`);

    if (number && !on(flags, options, 'no-issue')) {
        if (!repo || !ghAvailable()) {
            process.stderr.write(
                'blong-dev: the issue was not updated — this checkout no longer claims the plan\n',
            );
        } else {
            issueTrack(repo, number, {
                // The claim label and whichever host label the issue carries: a release must not
                // leave a host named on a plan nobody holds.
                removeLabels: [CLAIM_LABEL, ...issueState(root, plan).labels.filter(isHostLabel)],
                ...(claim?.by ? {unassign: claim.by} : {}),
            });
            publishIssue(root, published, options, flags);
        }
    }
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
                adopt(root, doc, rest.slice(1), options, flags);
                return;
            }
            case 'claim': {
                const local = findPlanFile(root, rest[0]);
                if (local !== undefined) {
                    claim(root, readPlan(local), options, flags);
                } else {
                    claimFromIssue(root, rest[0], options, flags);
                }
                return;
            }
            case 'release': {
                const local = findPlanFile(root, rest[0]) ?? findPlanByIssue(root, rest[0]);
                if (local === undefined) {
                    fail(
                        `no plan at "${rest[0] ?? ''}" — it is a file, a folder under plans/, or a ` +
                            'published issue number',
                    );
                }
                release(root, loadAt(local), options, flags);
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
