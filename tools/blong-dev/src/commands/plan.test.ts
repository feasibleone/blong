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

import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {setHindsightStoreFactory} from '../memory/hindsight/hindsightRuntime.ts';
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
        /^- \[ \] \[@@T-001\]\(\.\.\/\.\.\/realm\/blong-agent\/\.github\/memory\/todo\.md#t-001--scaffold-the-realm\) Scaffold the realm$/m,
        'the id is a link to the entry that holds the detail',
    );
    t.match(
        trimmed,
        /^- \[ \] \[@@T-002\]\(\.\.\/\.\.\/\.github\/memory\/todo\.md#t-002--write-the-page\) Write the page$/m,
        'a root entry is linked the same way from a plan folder',
    );
    t.match(trimmed, /^\- \[ \] \[@@T-003\]\([^)]+\) Add the tap group$/m);
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
    t.match(read(repo.file), /^- \[x\] \[@@T-001\]\([^)]*\) Scaffold the realm$/m, 'the box is ticked');

    const reopened = await capture(() => memory(['reopen', 'T-001']));
    t.equal(reopened.code, undefined, `reopen succeeded: ${reopened.err}`);
    t.match(read(repo.file), /^- \[ \] \[@@T-001\]\([^)]*\) Scaffold the realm$/m, 'reopening unticks it');
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
        /^- \[ \] \[@@T-001\]\([^)]*#t-001--scaffold-the-realm-and-boot-it\) Scaffold the realm and boot it$/m,
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
        read(repo.file).replace(/\[@@T-001\]\([^)]*\)/, '@@T-001'),
    );
    const drifted = await capture(() => plan(['check', 'demo']));
    t.equal(drifted.code, 1, 'a task that names its entry without a link is a problem');
    t.match(drifted.err, /links to nothing — run `plan sync`/);

    const synced = await capture(() => plan(['sync', 'demo']));
    t.match(synced.out, /1 link\(s\) written/);
    t.match(read(repo.file), /^- \[ \] \[@@T-001\]\([^)]*\) Scaffold the realm$/m);
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
        /^- \[ \] \[@@T-001\]\([^)]*\) An older task$/m,
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
