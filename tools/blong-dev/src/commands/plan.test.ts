/**
 * The plan command end to end: create tasks, trim the plan, tick on close, and align what drifted.
 *
 * memory-refs: ignore — the task and decision ids below belong to fixtures that no memory file
 * holds, so the reference scan has nothing to resolve them against.
 *
 * Each case runs in a throwaway repository whose `rush.json` makes the temp directory the root,
 * because the command reads `plans/` and writes the memory files by the same paths a developer's
 * checkout uses. The semantic index is switched off through the injectable store factory, so
 * nothing here touches a network.
 */

import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {setHindsightStoreFactory} from '../memory/hindsight/hindsightRuntime.ts';
import {issueBody, setIssueReader} from '../plan/planGithub.ts';
import {memory} from './memory.ts';
import {plan} from './plan.ts';

const PLAN = `# Demo plan

## Work breakdown

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with \`kukum realm add\`.

      - verify: \`blong ./index.ts\` starts

- [ ] Write the page · area: docs
      One page.

- [ ] Add the tap group · area: realm/blong-agent
`;

interface ICaptured {
    out: string;
    err: string;
    code: number | undefined;
}

/** Run a command with its streams captured. */
async function capture(run: () => Promise<void>): Promise<ICaptured> {
    const out: string[] = [];
    const err: string[] = [];
    const originalOut = process.stdout.write;
    const originalErr = process.stderr.write;
    const previousCode = process.exitCode;
    process.exitCode = undefined;
    process.stdout.write = ((chunk: unknown): boolean => {
        out.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown): boolean => {
        err.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;
    try {
        await run();
        return {out: out.join(''), err: err.join(''), code: process.exitCode};
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
        process.exitCode = previousCode;
    }
}

/** A throwaway repository with one plan. */
function tempRepo(planText = PLAN): {
    dir: string;
    file: string;
    restore: () => void;
} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-plan-'));
    mkdirSync(join(dir, 'realm/blong-agent'), {recursive: true});
    writeFileSync(
        join(dir, 'rush.json'),
        JSON.stringify({
            projects: [
                {packageName: '@feasibleone/blong-agent', projectFolder: 'realm/blong-agent'},
            ],
        }),
    );
    const planDir = join(dir, 'plans/demo');
    mkdirSync(planDir, {recursive: true});
    const file = join(planDir, 'plan.md');
    writeFileSync(file, planText);
    const previous = process.cwd();
    process.chdir(dir);
    return {
        dir,
        file,
        restore: () => {
            process.chdir(previous);
            rmSync(dir, {recursive: true, force: true});
        },
    };
}

const read = (path: string): string => readFileSync(path, 'utf8');

test('plan tasks creates one entry per task and trims the plan to titles', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo();
    t.teardown(repo.restore);

    const result = await capture(() => plan(['tasks', 'demo', '--apply']));
    t.equal(result.code, undefined, 'a clean run exits zero');
    t.match(result.out, /# T-001 Scaffold the realm · realm\/blong-agent/);

    const agentTodo = read(join(repo.dir, 'realm/blong-agent/.github/memory/todo.md'));
    t.match(agentTodo, /### T-001 — Scaffold the realm/);
    t.match(agentTodo, /Planned in `plans\/demo\/plan\.md`\./, 'the entry traces its plan');
    t.match(agentTodo, /- verify: `blong \.\/index\.ts` starts/, 'the detail moved into memory');
    t.match(agentTodo, /_2026|_\d{4}-\d{2}-\d{2} · realm\/blong-agent · open_/, 'with its area');

    const rootTodo = read(join(repo.dir, '.github/memory/todo.md'));
    t.match(rootTodo, /### T-002 — Write the page/);
    t.match(rootTodo, /· docs · open/, 'a reserved area lands in the root file');

    const trimmed = read(repo.file);
    t.match(
        trimmed,
        /^- \[ \] \[@@T-001 Scaffold the realm\]\(\.\.\/\.\.\/realm\/blong-agent\/\.github\/memory\/todo\.md#t-001--scaffold-the-realm\)$/m,
        'the id carries the title, and the line is one a reader can click',
    );
    t.match(
        trimmed,
        /^- \[ \] \[@@T-002 Write the page\]\(\.\.\/\.\.\/\.github\/memory\/todo\.md#t-002--write-the-page\)$/m,
        'a root entry is linked the same way from a plan folder',
    );
    t.match(trimmed, /^\- \[ \] \[@@T-003 [^\]]+\]\([^)]+\)$/m);
    t.match(
        trimmed,
        /<!-- prettier-ignore -->\n- \[ \] \[@@T-001 /,
        'and the formatter is told to leave the list as it is',
    );
    t.notMatch(trimmed, /kukum realm add/, 'the detail left the plan');
    t.notMatch(trimmed, /· area:/, 'so did the area marker');
    t.end();
});

test('plan tasks is idempotent', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo();
    t.teardown(repo.restore);

    await capture(() => plan(['tasks', 'demo', '--apply']));
    const before = read(repo.file);
    const second = await capture(() => plan(['tasks', 'demo', '--apply']));
    t.match(second.out, /3 task\(s\) already carry an id/);
    t.equal(read(repo.file), before, 'the plan is byte-for-byte what it was');
    t.end();
});

test('memory close ticks the plan task beside closing the entry', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo();
    t.teardown(repo.restore);

    await capture(() => plan(['tasks', 'demo', '--apply']));
    const closed = await capture(() => memory(['close', 'T-001', '--note', 'landed']));
    t.equal(closed.code, undefined, `close succeeded: ${closed.err}`);
    t.match(closed.out, /T-001 ticked in plans\/demo\/plan\.md:/, 'the marker is reported');
    t.match(
        read(repo.file),
        /^- \[x\] \[@@T-001 Scaffold the realm\]\([^)]*\)$/m,
        'the box is ticked',
    );

    const reopened = await capture(() => memory(['reopen', 'T-001']));
    t.equal(reopened.code, undefined, `reopen succeeded: ${reopened.err}`);
    t.match(
        read(repo.file),
        /^- \[ \] \[@@T-001 Scaffold the realm\]\([^)]*\)$/m,
        'reopening unticks it',
    );
    t.end();
});

test('plan sync aligns a title that changed in memory', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo();
    t.teardown(repo.restore);

    await capture(() => plan(['tasks', 'demo', '--apply']));
    await capture(() => memory(['edit', 'T-001', '--title', 'Scaffold the realm and boot it']));
    const result = await capture(() => plan(['sync', 'demo']));
    t.match(result.out, /1 title\(s\) aligned/);
    t.match(
        read(repo.file),
        /^- \[ \] \[@@T-001 Scaffold the realm and boot it\]\([^)]*#t-001--scaffold-the-realm-and-boot-it\)$/m,
        'the label and the anchor both follow the entry',
    );
    t.end();
});

test('plan sync gives a bare token the link it is missing, and check reports it until then', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo();
    t.teardown(repo.restore);

    await capture(() => plan(['tasks', 'demo', '--apply']));
    // A plan converted before the link form, or one somebody edited by hand.
    writeFileSync(
        repo.file,
        read(repo.file).replace(
            /\[@@T-001 Scaffold the realm\]\([^)]*\)/,
            '@@T-001 Scaffold the realm',
        ),
    );
    const drifted = await capture(() => plan(['check', 'demo']));
    t.equal(drifted.code, 1, 'a task that names its entry without a link is a problem');
    t.match(drifted.err, /links to nothing — run `plan sync`/);

    const synced = await capture(() => plan(['sync', 'demo']));
    t.match(synced.out, /1 link\(s\) written/);
    t.match(read(repo.file), /^- \[ \] \[@@T-001 Scaffold the realm\]\([^)]*\)$/m);
    const clean = await capture(() => plan(['check', 'demo']));
    t.equal(clean.code, undefined, `the repaired plan checks: ${clean.err}`);
    t.end();
});

test('plan check refuses a task that names no area', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo('- [ ] No area here\n      Detail.\n');
    t.teardown(repo.restore);

    const result = await capture(() => plan(['check', 'demo']));
    t.equal(result.code, 1, 'the exit code fails a script');
    t.match(result.err, /names no area/);
    t.end();
});

test('plan adopt puts an existing todo on the plan board', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo('# Demo plan\n\n## Work breakdown\n\n- [ ] One · area: docs\n');
    t.teardown(repo.restore);

    await capture(() =>
        memory([
            'add',
            'todo',
            '--title',
            'An older task',
            '--area',
            'realm/blong-agent',
            '--body',
            'Already known.',
        ]),
    );
    const adopted = await capture(() => plan(['adopt', 'demo', 'T-001']));
    t.equal(adopted.code, undefined, `adopt succeeded: ${adopted.err}`);
    t.match(
        read(repo.file),
        /^- \[ \] \[@@T-001 An older task\]\([^)]*\)$/m,
        'an adopted task is as navigable as a created one',
    );
    t.end();
});

test('plan status lists the decisions it cites, and check fails on a dead one', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(
        '# Demo plan\n\n## Work breakdown\n\n- [ ] One · area: docs\n\n' +
            '## Considerations\n\nThe rule that shapes it is `@@D-001`.\n',
    );
    t.teardown(repo.restore);

    await capture(() =>
        memory([
            'add',
            'decision',
            '--title',
            'A rule the plan rests on',
            '--area',
            'docs',
            '--body',
            'Because the alternative was worse.',
        ]),
    );
    const live = await capture(() => plan(['status', 'demo']));
    t.match(live.out, /# decisions: D-001/, 'the cited decision is listed');
    t.match(live.out, /D-001 active — A rule the plan rests on/, 'with its title');

    writeFileSync(repo.file, read(repo.file).replace('@@D-001', '@@D-999'));
    const dead = await capture(() => plan(['check', 'demo']));
    t.equal(dead.code, 1, 'a citation that resolves to nothing fails the check');
    t.match(dead.err, /D-999 is cited but D-999 has no memory entry/);
    t.end();
});

test('a decision added with --plan is listed on the board, and its line follows the entry', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo();
    t.teardown(repo.restore);

    const added = await capture(() =>
        memory([
            'add',
            'decision',
            '--title',
            'A rule taken while executing',
            '--area',
            'docs',
            '--body',
            'Because the alternative was worse.',
            '--plan',
            'demo',
        ]),
    );
    t.equal(added.code, undefined, `add succeeded: ${added.err}`);
    const decisionId = /# (?<id>D-\d{3}) active/.exec(added.out)?.groups?.['id'] ?? '';
    t.ok(decisionId, 'the entry has an id');
    t.match(
        read(repo.file),
        /^## Decisions and frictions$/m,
        'the section appears on the board as the decision is taken',
    );
    t.match(
        read(repo.file),
        /^- \[@@D-001\]\(\.\.\/\.\.\/\.github\/memory\/decision\.md#[^)]+\) A rule taken while executing · active$/m,
        'with a link, the title and the status',
    );

    await capture(() => memory(['edit', decisionId, '--title', 'The rule, restated']));
    const synced = await capture(() => plan(['sync', 'demo']));
    t.match(synced.out, /1 entry line\(s\) refreshed/);
    t.match(
        read(repo.file),
        /^- \[@@D-001\]\([^)]*the-rule-restated\) The rule, restated · active$/m,
        'a retitled decision is re-anchored and relabelled by the sync',
    );

    const friction = await capture(() =>
        memory([
            'add',
            'friction',
            '--title',
            'Something cost more than it looked',
            '--area',
            'docs',
            '--plan',
            'demo',
        ]),
    );
    const frictionId = /# (?<id>F-\d{3}) open/.exec(friction.out)?.groups?.['id'] ?? '';
    await capture(() => memory(['close', frictionId, '--note', 'resolved by hand']));
    t.match(
        read(repo.file),
        /^- \[@@F-001\]\([^)]*\) Something cost more than it looked · resolved$/m,
        'closing the friction says so on the board, without a second sync',
    );

    const refused = await capture(() =>
        memory(['add', 'todo', '--title', 'A task', '--area', 'docs', '--plan', 'demo']),
    );
    t.equal(refused.code, 1, 'a todo is not listed beside the decisions');
    t.match(refused.err, /put it in the work breakdown/);
    t.end();
});

const DECIDED_PLAN = `# Demo plan

## 2. Technical approach

### Decisions this plan takes

- The bytes live in a scope, not a namespace · area: realm/blong-agent
      A scope is what the cookie carries, so a read can prove the caller owns the bytes.

## Work breakdown

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with \`kukum realm add\`.
`;

test('plan tasks creates the decisions the plan takes beside its tasks', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(DECIDED_PLAN);
    t.teardown(repo.restore);

    const result = await capture(() => plan(['tasks', 'demo', '--apply']));
    t.equal(result.code, undefined, `the run succeeded: ${result.err}`);
    t.match(result.out, /# D-001 The bytes live in a scope, not a namespace · realm\/blong-agent/);

    const decision = read(join(repo.dir, 'realm/blong-agent/.github/memory/decision.md'));
    t.match(decision, /### D-001 — The bytes live in a scope, not a namespace/);
    t.match(decision, /Planned in `plans\/demo\/plan\.md`\./, 'the entry traces its plan');
    t.match(decision, /A scope is what the cookie carries/, 'the reasoning moved into the entry');

    const trimmed = read(repo.file);
    t.match(
        trimmed,
        /^- \[@@D-001 The bytes live in a scope, not a namespace\]\(\.\.\/\.\.\/realm\/blong-agent\/\.github\/memory\/decision\.md#d-001--[^)]*\)$/m,
        'the decision line is the link and the title',
    );
    t.notMatch(trimmed, /cookie carries/, 'its reasoning left the plan');
    t.match(trimmed, /^### Decisions this plan takes$/m, 'the list keeps its heading');
    t.match(trimmed, /^- \[ \] \[@@T-001 /m, 'the task below it is created as usual');
    t.end();
});

test('a decision created from the plan is checked and realigned like a task', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(DECIDED_PLAN);
    t.teardown(repo.restore);

    await capture(() => plan(['tasks', 'demo', '--apply']));
    const edited = await capture(() =>
        memory(['edit', 'D-001', '--title', 'The bytes live in the scope cookie']),
    );
    t.equal(edited.code, undefined, `the edit succeeded: ${edited.err}`);

    const checked = await capture(() => plan(['check', 'demo']));
    t.equal(checked.code, 1, 'drift is a problem');
    t.match(
        checked.err,
        /decision "The bytes live in a scope, not a namespace" and its entry say different things/,
    );

    const synced = await capture(() => plan(['sync', 'demo']));
    t.equal(synced.code, undefined, `sync succeeded: ${synced.err}`);
    t.match(synced.out, /1 decision\(s\) aligned/);
    t.match(
        read(repo.file),
        /^- \[@@D-001 The bytes live in the scope cookie\]\([^)]*#d-001--the-bytes-live-in-the-scope-cookie\)$/m,
        'the label and the anchor both follow the entry',
    );

    const again = await capture(() => plan(['check', 'demo']));
    t.equal(again.code, undefined, `check is clean afterwards: ${again.err}`);
    t.end();
});

test('plan check names a positional title, and a title another entry already holds', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(
        `# Demo plan

## Work breakdown

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with \`kukum realm add\`.

- [ ] Group 3 verification · area: realm/blong-agent
      Runs the package's tests and lint.
`,
    );
    t.teardown(repo.restore);

    // An entry whose title the plan would reuse: two entries with one title cannot be told apart.
    await capture(() =>
        memory(['add', 'todo', '--title', 'Scaffold the realm', '--area', 'realm/blong-agent']),
    );

    const result = await capture(() => plan(['check', 'demo']));
    t.equal(result.code, undefined, `a note is not a failure: ${result.err}`);
    t.match(result.out, /# note: .*"Scaffold the realm" is already T-001's title/);
    t.match(result.out, /# note: .*"Group 3 verification" names a position in the plan/);
    t.match(result.out, /2 note\(s\)/);
    t.end();
});

/**
 * A plan with front matter and no issue: a claim on it stays local, so these cases never reach `gh`.
 */
const OWNED_PLAN = `---
slug: demo
title: Demo plan — a plan
status: approved
approved: 2026-11-23
---

# Demo plan

## Work breakdown

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with \`kukum realm add\`.
`;

test('plan init claims the plan for this host', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo('# Demo plan\n\n## Work breakdown\n\n- [ ] One · area: docs\n');
    t.teardown(repo.restore);

    const result = await capture(() =>
        plan(['init', 'demo', '--no-issue', '--no-slack', '--no-tasks', '--no-decisions']),
    );
    t.equal(result.code, undefined, `init succeeded: ${result.err}`);
    t.match(result.out, /# claimed by \S+ on \d{4}-\d{2}-\d{2}/, 'the run says who holds it');
    t.match(read(repo.file), /^claimed: \S+$/m, 'the front matter records the host');
    t.match(
        read(join(repo.dir, 'plans/active.json')),
        /"slug": "demo"/,
        'and the plan is the active one',
    );
    t.end();
});

/**
 * A plan that already has an issue: the entry it creates should name the issue, not the folder.
 */
const PUBLISHED_PLAN = `---
slug: demo
title: Demo plan — a plan
status: approved
approved: 2026-11-23
issue: 42
issueUrl: https://github.com/feasibleone/blong/issues/42
---

# Demo plan

## Work breakdown

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with \`kukum realm add\`.
`;

test('an entry names the issue once the plan has one', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(PUBLISHED_PLAN);
    t.teardown(repo.restore);

    const result = await capture(() => plan(['tasks', 'demo', '--apply']));
    t.equal(result.code, undefined, `tasks succeeded: ${result.err}`);
    const todo = read(join(repo.dir, 'realm/blong-agent/.github/memory/todo.md'));
    t.match(todo, /Planned in \[#42\]\(https:\/\/github\.com\/feasibleone\/blong\/issues\/42\)\./);
    t.notMatch(todo, /Planned in `plans\/demo\/plan\.md`/, 'the folder is not named at all');
    t.end();
});

test('plan sync points an entry that named the folder at the issue', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(OWNED_PLAN);
    t.teardown(repo.restore);

    await capture(() => plan(['tasks', 'demo', '--apply']));
    const todo = join(repo.dir, 'realm/blong-agent/.github/memory/todo.md');
    t.match(read(todo), /Planned in `plans\/demo\/plan\.md`\./, 'written before the issue existed');

    // What `init` does when it publishes: the issue lands in the front matter.
    writeFileSync(
        repo.file,
        read(repo.file).replace(
            'approved: 2026-11-23',
            'approved: 2026-11-23\nissue: 42\nissueUrl: https://github.com/feasibleone/blong/issues/42',
        ),
    );
    const synced = await capture(() => plan(['sync', 'demo', '--no-issue']));
    t.equal(synced.code, undefined, `sync succeeded: ${synced.err}`);
    t.match(synced.out, /1 memory file\(s\) now name the issue/);
    t.match(read(todo), /Planned in \[#42\]/, 'and the entry names the issue');
    t.end();
});

test('plan claim records the host, and another host is refused', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(OWNED_PLAN);
    t.teardown(repo.restore);

    const first = await capture(() => plan(['claim', 'demo', '--host', 'ms-01']));
    t.equal(first.code, undefined, `claim succeeded: ${first.err}`);
    t.match(first.out, /# claimed by ms-01 on \d{4}-\d{2}-\d{2}/);
    t.match(read(repo.file), /^claimed: ms-01$/m, 'the front matter holds the claim');
    t.match(read(repo.file), /^claimedAt: \d{4}-\d{2}-\d{2}$/m, 'with the day it was taken');

    const rival = await capture(() => plan(['claim', 'demo', '--host', 'ms-02']));
    t.equal(rival.code, 1, 'a second host cannot take it');
    t.match(rival.err, /claimed by "ms-01"/);
    t.match(rival.err, /--force/, 'and is told how to say it means it');

    const forced = await capture(() => plan(['claim', 'demo', '--host', 'ms-02', '--force']));
    t.equal(forced.code, undefined, `--force takes it over: ${forced.err}`);
    t.match(read(repo.file), /^claimed: ms-02$/m);
    t.end();
});

test('a plan another host holds refuses the verbs that edit its memory', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(OWNED_PLAN);
    t.teardown(repo.restore);

    await capture(() => plan(['claim', 'demo', '--host', 'ms-01']));
    const before = read(repo.file);

    for (const [args, verb] of [
        [['tasks', 'demo', '--apply'], 'plan tasks --apply'],
        [['sync', 'demo'], 'plan sync'],
        [['adopt', 'demo', 'T-999'], 'plan adopt'],
    ] as const) {
        const refused = await capture(() => plan([...args]));
        t.equal(refused.code, 1, `${verb} refuses a plan it does not hold`);
        t.match(refused.err, /claimed by "ms-01"/);
        t.match(refused.err, new RegExp(verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    t.equal(read(repo.file), before, 'and nothing was written');

    const status = await capture(() => plan(['status', 'demo']));
    t.match(status.out, /# claimed: ms-01 .* — not this host/, 'status says whose it is');

    const checked = await capture(() => plan(['check', 'demo']));
    t.match(checked.out, /# note: this plan is claimed by "ms-01"/, 'and check reports it');
    t.end();
});

test('plan release lets go, and --remove takes only the plan file', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(OWNED_PLAN);
    t.teardown(repo.restore);
    // A support file the folder keeps: the prompt is what the plan answers, and it is not a plan.
    writeFileSync(join(repo.dir, 'plans/demo/plan.prompt.md'), '# the request\n');

    await capture(() => plan(['claim', 'demo']));
    const created = await capture(() => plan(['tasks', 'demo', '--apply']));
    t.equal(created.code, undefined, `tasks succeeded: ${created.err}`);

    const released = await capture(() => plan(['release', 'demo']));
    t.equal(released.code, undefined, `release succeeded: ${released.err}`);
    t.notMatch(read(repo.file), /^claimed:/m, 'the claim is gone');
    t.notMatch(read(repo.file), /^claimedAt:/m);

    await capture(() => plan(['claim', 'demo', '--host', 'ms-01']));
    const removed = await capture(() =>
        plan(['release', 'demo', '--remove', '--force', '--host', 'ms-01']),
    );
    t.equal(removed.code, undefined, `remove succeeded: ${removed.err}`);
    t.notOk(existsSync(repo.file), 'plan.md is gone');
    t.ok(existsSync(join(repo.dir, 'plans/demo')), 'the folder stays');
    t.ok(existsSync(join(repo.dir, 'plans/demo/plan.prompt.md')), 'with its support files');

    const todo = read(join(repo.dir, 'realm/blong-agent/.github/memory/todo.md'));
    t.match(
        todo,
        /Planned in a plan folder whose `plan\.md` has since been removed\./,
        'and the entry no longer points at a file that is gone',
    );

    const gone = await capture(() => plan(['check', 'demo']));
    t.equal(gone.code, 1, 'a released plan is not a plan any more');
    t.match(gone.err, /plans\/demo holds no plan/, 'and the prompt beside it is not read as one');
    t.end();
});

test('plan release takes the issue number a claim was made from', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    const repo = tempRepo(PUBLISHED_PLAN);
    t.teardown(repo.restore);

    await capture(() => plan(['claim', 'demo', '--no-issue']));
    // The number names the local plan that carries it: after a claim from an issue it is the handle
    // a person still has at hand, so release reads the front matter and finds the file.
    const released = await capture(() => plan(['release', '42', '--no-issue']));
    t.equal(released.code, undefined, `release by issue succeeded: ${released.err}`);
    t.notMatch(read(repo.file), /^claimed:/m, 'the claim is gone');
    t.match(released.out, /# released/, 'and the run says so');

    const unknown = await capture(() => plan(['release', '4242']));
    t.equal(unknown.code, 1, 'a number no local plan carries is refused');
    t.match(unknown.err, /no plan at "4242"/, 'naming the handle it could not resolve');
    t.end();
});

/** The front matter a published issue carries: the keys a host with no checkout cannot invent. */
const REMOVED_FRONT_MATTER = `slug: sport
title: blong-sport — continuous deployment to the k3d dev cluster
status: closed
repo: feasibleone/blong
issue: 296
issueUrl: https://github.com/feasibleone/blong/issues/296
platform: slack
account: blong-bot
channelName: plan-sport
conversationId: C0CGRSZ633M
channelUrl: https://example.slack.com/archives/C0CGRSZ633M
created: 2026-11-01
approved: 2026-11-02
closed: 2026-11-20`;

const ISSUE_BODY = '# blong-sport — continuous deployment\n\n- [ ] One · area: docs\n';

/** An issue a rebuild reads instead of `gh`. */
function serveIssue(frontMatter?: string, removedAt?: string): void {
    const body = issueBody(ISSUE_BODY, 'sport', {
        ...(frontMatter ? {frontMatter} : {}),
        ...(removedAt ? {removedAt} : {}),
    });
    setIssueReader(() => ({
        title: 'blong-sport — continuous deployment to the k3d dev cluster',
        url: 'https://github.com/feasibleone/blong/issues/296',
        body,
        labels: ['plan'],
    }));
}

test('a plan rebuilt from its issue comes back with the front matter it had', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    serveIssue(REMOVED_FRONT_MATTER, '2026-11-23');
    t.teardown(() => setIssueReader(null));
    const repo = tempRepo();
    t.teardown(repo.restore);
    rmSync(repo.file);

    const result = await capture(() =>
        plan(['claim', '296', '--repo', 'feasibleone/blong', '--slug', 'sport', '--no-issue']),
    );
    t.equal(result.code, undefined, `the claim succeeded: ${result.err}`);

    const rebuilt = read(join(repo.dir, 'plans/sport/plan.md'));
    t.match(rebuilt, /^status: closed$/m, 'the status the plan was released with, not `approved`');
    t.match(rebuilt, /^approved: 2026-11-02$/m, 'the approval date');
    t.match(rebuilt, /^closed: 2026-11-20$/m, 'and the day it closed');
    t.match(rebuilt, /^conversationId: C0CGRSZ633M$/m, 'the Slack channel the plan works in');
    t.match(rebuilt, /^channelUrl: https:\/\/example\.slack\.com/m, 'with where a person opens it');
    t.match(rebuilt, /^recoveredAt: \d{4}-\d{2}-\d{2}$/m, 'and the day it was recovered');
    t.match(rebuilt, /^issue: 296$/m, 'the coordinates are the issue it came from');
    t.match(rebuilt, /^claimed: /m, 'the claim is the one this run just took');
    t.notMatch(rebuilt, /^localRemovedAt:/m, 'a recovered plan is not a removed one');
    t.match(rebuilt, /^# blong-sport — continuous deployment$/m, 'the body starts at the plan');
    t.notMatch(rebuilt, /plan-front-matter/, 'the published comment is not part of the plan');
    t.notMatch(rebuilt, /was removed on/, 'nor is the sentence above it');
    t.end();
});

test('an issue published before the front-matter comment rebuilds from defaults', async t => {
    setHindsightStoreFactory(() => null);
    t.teardown(() => setHindsightStoreFactory(null));
    serveIssue();
    t.teardown(() => setIssueReader(null));
    const repo = tempRepo();
    t.teardown(repo.restore);
    rmSync(repo.file);

    const result = await capture(() =>
        plan(['claim', '296', '--repo', 'feasibleone/blong', '--slug', 'sport', '--no-issue']),
    );
    t.equal(result.code, undefined, `the claim succeeded: ${result.err}`);
    t.match(result.err, /carries no front matter/, 'the loss is stated rather than hidden');

    const rebuilt = read(join(repo.dir, 'plans/sport/plan.md'));
    t.match(rebuilt, /^status: approved$/m, 'a plan with no recovered status is approved');
    t.match(rebuilt, /^slug: sport$/m, 'the slug is the one that was named');
    t.notMatch(rebuilt, /^conversationId:/m, 'and there is no channel to invent');
    t.end();
});
