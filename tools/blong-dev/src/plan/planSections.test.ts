/**
 * The plan's decision and friction section: what appears on the board, and what a sync repairs.
 *
 * These are pure cases over plan text — the section is a contract between `memory add --plan`,
 * `memory close` and `plan sync`, so a regression here loses a decision from the plan without
 * anything failing.
 *
 * memory-refs: ignore — the entry ids in the fixtures name no memory file, and a citation the
 * linter cannot resolve is what one case is about.
 */

import {test} from 'tap';

import {parsePlan} from './planParse.ts';
import {
    PLAN_ENTRIES_HEADING,
    addPlanEntry,
    planEntryIds,
    planEntryLine,
    planSectionBounds,
    refreshPlanEntries,
} from './planSections.ts';

const PLAN = `# A plan

## 3. Work breakdown

- [ ] One · area: docs
`;

const ENTRY = {
    id: 'D-811',
    title: 'a plan task line links to its memory entry',
    status: 'active',
    path: 'tools/blong-dev/.github/memory/decision.md',
};

test('a plan with no section gains one, with the entry in it', async t => {
    const doc = parsePlan(PLAN, '/repo/plans/demo/plan.md');
    const line = planEntryLine('/repo', doc.path, ENTRY);
    t.equal(
        line,
        '- [@@D-811](../../tools/blong-dev/.github/memory/decision.md' +
            '#d-811--a-plan-task-line-links-to-its-memory-entry) ' +
            'a plan task line links to its memory entry · active',
        'the line is a link, a title and a status',
    );
    const updated = addPlanEntry(doc, ENTRY.id, line);
    t.equal(updated.lines.at(-1), '', 'the file still ends with a newline line');
    t.ok(
        updated.lines.includes(PLAN_ENTRIES_HEADING),
        'the section heading is written when the first entry arrives',
    );
    t.same(planEntryIds(updated), ['D-811']);
    t.end();
});

test('a second entry joins the section and a repeat replaces its line', async t => {
    const doc = parsePlan(PLAN, '/repo/plans/demo/plan.md');
    const first = addPlanEntry(doc, 'D-811', planEntryLine('/repo', doc.path, ENTRY));
    const friction = {
        id: 'F-713',
        title: 'removing a signed-in user refused the credential delete',
        status: 'resolved',
        path: 'realm/blong-access/.github/memory/friction.md',
    };
    const second = addPlanEntry(first, friction.id, planEntryLine('/repo', doc.path, friction));
    t.same(planEntryIds(second), ['D-811', 'F-713'], 'both are listed, in the order they arrived');

    const closed = {...ENTRY, status: 'superseded'};
    const third = addPlanEntry(second, 'D-811', planEntryLine('/repo', doc.path, closed));
    t.same(planEntryIds(third), ['D-811', 'F-713'], 'a repeat is a replacement, not a duplicate');
    t.match(
        third.lines.join('\n'),
        /#d-811--a-plan-task-line-links-to-its-memory-entry\) a plan task line links to its memory entry · superseded/,
    );
    t.end();
});

test('a section that is not last keeps its own bounds', async t => {
    const doc = parsePlan(
        '# A plan\n\n## Decisions and frictions\n\n- [@@D-811](../x.md#d-811--a) a · active\n\n' +
            '## 6. Tracking\n\nWords.\n',
    );
    const bounds = planSectionBounds(doc);
    t.equal(bounds?.line, 2);
    t.equal(doc.lines[bounds!.end], '## 6. Tracking', 'the next heading ends the section');
    t.same(planEntryIds(doc), ['D-811']);
    t.end();
});

test('a sync re-reads every line it owns and leaves the rest alone', async t => {
    const doc = addPlanEntry(
        parsePlan(PLAN, '/repo/plans/demo/plan.md'),
        'D-811',
        '- [@@D-811](../old.md#d-811--old) an older wording · active',
    );
    const edited = parsePlan(
        doc.lines.join('\n').replace('## 3. Work breakdown', '## 3. Work breakdown\n\n- not ours'),
        doc.path,
    );
    const entries = new Map([
        ['D-811', {...ENTRY, title: 'a retitled decision', status: 'superseded'}],
    ]);
    const result = refreshPlanEntries(edited, '/repo', entries);
    t.same(result.refreshed, ['D-811']);
    t.same(result.missing, []);
    t.match(
        result.doc.lines.join('\n'),
        /\[@@D-811\]\(\.\.\/\.\.\/tools\/blong-dev\/\.github\/memory\/decision\.md#d-811--a-retitled-decision\) a retitled decision · superseded/,
        'the anchor, the title and the status all follow the entry',
    );
    t.match(result.doc.lines.join('\n'), /^- not ours$/m, 'a line this tool does not own is kept');
    t.end();
});

test('an entry the memory no longer holds is reported, not deleted', async t => {
    const doc = addPlanEntry(
        parsePlan(PLAN, '/repo/plans/demo/plan.md'),
        'F-900',
        '- [@@F-900](../gone.md#f-900--gone) gone · open',
    );
    const result = refreshPlanEntries(doc, '/repo', new Map());
    t.same(result.missing, ['F-900']);
    t.same(planEntryIds(result.doc), ['F-900'], 'the line stays for a reader to see');
    t.end();
});
