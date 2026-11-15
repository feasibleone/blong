/**
 * The plan task grammar: what a plan's work breakdown is allowed to say.
 *
 * These are pure cases over text — no repository, no memory files — because the grammar
 * is the contract the command layer and `blong-dev memory close` both depend on, and a
 * regression here is silent: a task that is not recognised simply never gets a todo.
 */

import {test} from 'tap';

import {entryLink, githubAnchor, issueLinks} from './planLinks.ts';
import {
    bodyWithoutFrontMatter,
    parsePlan,
    parseTaskLine,
    planTitle,
    positionalTitle,
    renderTaskLine,
    taskBodyText,
    trimDecisionsToLines,
    trimTasksToLines,
    writeMeta,
} from './planParse.ts';

const PLAN = `# A plan

## Work breakdown

- [ ] Scaffold the realm · area: realm/blong-agent
      Created with \`kukum realm add\`.

      - verify: \`blong ./index.ts\` starts

- [ ] Write the page · area: docs
      One page.

### Group 2

- [ ] Add the test · area: realm/blong-agent
`;

test('a task line carries a title, an area and an id once created', async t => {
    t.same(parseTaskLine('Scaffold the realm · area: realm/blong-agent'), {
        id: undefined,
        link: undefined,
        title: 'Scaffold the realm',
        area: 'realm/blong-agent',
    });
    t.same(parseTaskLine('@@T-531 Scaffold the realm'), {
        id: 'T-531',
        link: undefined,
        title: 'Scaffold the realm',
        area: undefined,
    });
    t.same(parseTaskLine('[@@T-531](../../pkg/.github/memory/todo.md#t-531--scaffold) Scaffold'), {
        id: 'T-531',
        link: '../../pkg/.github/memory/todo.md#t-531--scaffold',
        title: 'Scaffold',
        area: undefined,
    });
    t.equal(
        renderTaskLine({checked: false, id: 'T-531', title: 'Scaffold the realm'}),
        '- [ ] @@T-531 Scaffold the realm',
        'a task with no link keeps the bare token',
    );
    t.equal(
        renderTaskLine(
            {checked: true, id: 'T-531', title: 'Scaffold the realm'},
            '../../pkg/.github/memory/todo.md#t-531--scaffold-the-realm',
        ),
        '- [x] [@@T-531](../../pkg/.github/memory/todo.md#t-531--scaffold-the-realm) ' +
            'Scaffold the realm',
        'the link form a converted task carries',
    );
    t.end();
});

test('the parser finds each task with its own detail', async t => {
    const doc = parsePlan(PLAN);
    t.equal(doc.tasks.length, 3, 'three checkboxes are three tasks');
    t.same(
        doc.tasks.map(task => task.title),
        ['Scaffold the realm', 'Write the page', 'Add the test'],
    );
    t.same(doc.tasks[0]?.body, [
        'Created with `kukum realm add`.',
        '',
        '- verify: `blong ./index.ts` starts',
    ]);
    t.equal(doc.tasks[1]?.body.join('\n'), 'One page.');
    t.same(doc.tasks[2]?.body, [], 'a task with no continuation has no detail');
    t.same(doc.problems, [], 'a canonical plan has nothing to report');
    t.end();
});

test('a group note at the margin belongs to the group, not the last task', async t => {
    const doc = parsePlan(`- [ ] One · area: docs
      Detail.

- **Verification:** something about the group.
`);
    t.same(doc.tasks[0]?.body, ['Detail.'], 'the note is not swallowed into the task');
    t.end();
});

test('a task without an area is a problem a reader can act on', async t => {
    const doc = parsePlan('- [ ] No area here\n      Detail.\n');
    t.match(doc.problems[0], /names no area/);
    const defaulted = parsePlan('- [ ] No area here\n', '', 'docs');
    t.equal(defaulted.tasks[0]?.area, 'docs', 'a default area is what --area supplies');
    t.end();
});

test('a checked task without an id is reported, because nothing tracks it', async t => {
    const doc = parsePlan('- [x] Done but untracked · area: docs\n');
    t.match(doc.problems[0], /no @@T- id/);
    t.end();
});

test('a repeated title is reported', async t => {
    const doc = parsePlan('- [ ] Same · area: docs\n- [ ] Same · area: docs\n');
    t.match(doc.problems[0], /repeats the title/);
    t.end();
});

test('a checkbox inside a fence is not a task', async t => {
    const doc = parsePlan('```markdown\n- [ ] Not a task · area: docs\n```\n');
    t.equal(doc.tasks.length, 0);
    t.end();
});

test('trimming keeps the title and the id and drops the detail', async t => {
    const doc = parsePlan(PLAN);
    const ids = new Map([[doc.tasks[0]!, 'T-531']]);
    const links = new Map([
        [doc.tasks[0]!, '../../realm/blong-agent/.github/memory/todo.md#t-531--scaffold'],
    ]);
    const trimmed = trimTasksToLines(doc, ids, links);
    t.match(
        trimmed.lines.join('\n'),
        /^- \[ \] \[@@T-531\]\(\.\.\/\.\.\/realm\/blong-agent\/\.github\/memory\/todo\.md#t-531--scaffold\) Scaffold the realm$/m,
        'the id becomes a link a reader can follow',
    );
    t.notMatch(trimmed.lines.join('\n'), /kukum realm add/, 'the detail is gone');
    t.match(trimmed.lines.join('\n'), /^- \[ \] Write the page · area: docs$/m);
    t.end();
});

test('a link written once is not rewritten on the next read', async t => {
    const doc = parsePlan('- [ ] [@@T-531](../../pkg/.github/memory/todo.md#t-531--one) One\n');
    t.equal(doc.tasks[0]?.link, '../../pkg/.github/memory/todo.md#t-531--one');
    const trimmed = trimTasksToLines(doc, new Map(), new Map());
    t.equal(
        trimmed.lines.join('\n'),
        doc.lines.join('\n'),
        'a task whose line is already right is left alone',
    );
    t.end();
});

test('a memory entry link is relative to the plan and anchored on the entry', async t => {
    t.equal(
        githubAnchor('T-634 — Prove plan channel creation against the real workspace'),
        't-634--prove-plan-channel-creation-against-the-real-workspace',
        'an em dash is dropped and its two spaces leave two hyphens',
    );
    t.equal(githubAnchor('  Access: the `user.add` path  '), 'access-the-useradd-path');
    t.equal(
        entryLink('/repo', '/repo/plans/demo/plan.md', {
            id: 'T-531',
            title: 'Scaffold the realm',
            path: 'realm/blong-agent/.github/memory/todo.md',
        }),
        '../../realm/blong-agent/.github/memory/todo.md#t-531--scaffold-the-realm',
        'two levels up from plans/<slug>/ reaches the repository root',
    );
    t.end();
});

test('an issue resolves a task link from the repository root', async t => {
    t.equal(
        issueLinks(
            'See [@@T-531](../../realm/blong-agent/.github/memory/todo.md#t-531--scaffold).',
            'feasibleone/blong',
        ),
        'See [@@T-531](https://github.com/feasibleone/blong/blob/HEAD/' +
            'realm/blong-agent/.github/memory/todo.md#t-531--scaffold).',
    );
    t.equal(
        issueLinks('[docs](https://example.com/a)', 'feasibleone/blong'),
        '[docs](https://example.com/a)',
        'a link that is already a URL is left alone',
    );
    t.end();
});

test('the body text of a task is what the memory entry receives', async t => {
    const doc = parsePlan(PLAN);
    t.equal(taskBodyText(doc.tasks[1]!), 'One page.');
    t.end();
});

test('front matter is metadata for the tooling and not part of the published plan', async t => {
    const doc = parsePlan(
        '---\nslug: demo\ntitle: A plan\nstatus: approved\nissue: 12\n---\n\n# A plan\n\nBody.\n',
    );
    t.equal(doc.meta.slug, 'demo');
    t.equal(doc.meta.issue, 12);
    t.equal(planTitle(doc), 'A plan', 'the declared title wins over the heading');
    t.notMatch(bodyWithoutFrontMatter(doc), /^---/m, 'the issue body has no front matter');
    t.match(bodyWithoutFrontMatter(doc), /^# A plan/, 'the body starts at the heading');

    const written = writeMeta(doc, {conversationId: 'C1', channelName: 'plan-demo'});
    const reread = parsePlan(written.lines.join('\n'));
    t.equal(reread.meta.conversationId, 'C1');
    t.equal(reread.meta.title, 'A plan', 'a patch keeps what was there');
    t.end();
});

const DECIDED = `# A plan

## 2. Technical approach

### Where the capability lands

- **store** — \`realm/blong-blob\`, \`gateway/blob/\`

### Decisions this plan takes

- The bytes live in a scope, not a namespace · area: realm/blong-blob
      A scope is what the cookie carries, so a read can prove the caller owns the bytes.

- The upload route asks for its stream body · area: core/blong-gogo
      A parser at the root would accept what no route reads.

### Configuration

Nothing here.
`;

test('the decisions a plan takes are read like tasks, with their own list', async t => {
    const doc = parsePlan(DECIDED);
    t.same(doc.problems, [], 'a well-formed list reports nothing');
    t.equal(doc.decisions.length, 2);
    t.same(
        doc.decisions.map(decision => [decision.title, decision.area, decision.id]),
        [
            ['The bytes live in a scope, not a namespace', 'realm/blong-blob', undefined],
            ['The upload route asks for its stream body', 'core/blong-gogo', undefined],
        ],
    );
    t.equal(
        taskBodyText(doc.decisions[0]!),
        'A scope is what the cookie carries, so a read can prove the caller owns the bytes.',
    );
    t.equal(doc.tasks.length, 0, 'a plain bullet is not a task');
    t.end();
});

test('a created decision keeps its title and its link, and its detail leaves the plan', async t => {
    const doc = parsePlan(DECIDED);
    const ids = new Map([
        [doc.decisions[0]!, 'D-001'],
        [doc.decisions[1]!, 'D-002'],
    ]);
    const links = new Map([
        [doc.decisions[0]!, '../../.github/memory/decision.md#d-001--scope'],
        [doc.decisions[1]!, '../../core/blong-gogo/.github/memory/decision.md#d-002--body'],
    ]);
    const trimmed = trimDecisionsToLines(doc, ids, links);
    const text = trimmed.lines.join('\n');
    t.match(
        text,
        /^- \[@@D-001\]\(\.\.\/\.\.\/\.github\/memory\/decision\.md#d-001--scope\) The bytes live in a scope, not a namespace$/m,
        'the line is the link and the title',
    );
    t.notMatch(text, /cookie carries/, 'the reasoning moved into the entry');
    t.notMatch(text, /· area:/, 'so did the area marker');
    t.match(text, /^### Configuration$/m, 'the heading below the list survives');

    const reread = parsePlan(text);
    t.equal(reread.decisions.length, 2, 'the trimmed list parses back');
    t.same(reread.problems, [], 'and is still a valid plan');
    t.end();
});

test('a decision without an area, or with a section in its detail, is refused', async t => {
    const noArea = parsePlan(
        `${DECIDED.split('### Configuration')[0]}`.replace(' · area: core/blong-gogo', ''),
    );
    t.match(
        noArea.problems.join('\n'),
        /decision "The upload route asks for its stream body" names no area/,
    );
    t.end();
});

test('a plan without a decisions heading has none, and parses as it always did', async t => {
    const doc = parsePlan(PLAN);
    t.same(doc.decisions, []);
    t.equal(doc.tasks.length, 3);
    t.end();
});

test('a title that names its position rather than its subject is reported', async t => {
    t.equal(positionalTitle('Group 3 verification'), 'names a position in the plan, not the thing it checks');
    t.equal(positionalTitle('Phase 2'), 'names a position in the plan, not the thing it checks');
    t.equal(positionalTitle('Verification'), 'names a position in the plan, not the thing it checks');
    t.equal(positionalTitle('Group 4 tests and docs'), 'names a position in the plan, not the thing it checks');
    t.equal(positionalTitle('Group 2: the parser answers a bad type with 415'), undefined);
    t.equal(positionalTitle('Verify a mismatched content type answers 415'), undefined);
    t.equal(positionalTitle("The realm's tap groups"), undefined, 'a plural is not a position');
    t.end();
});
