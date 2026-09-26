/**
 * Progress points as the steps a test report shows (PRD R26/R27).
 *
 * A point announced inside a branch belongs to it, and the branch is a group; both renderers
 * (the tap report here, `blong-allure` for Allure) draw the tree this file builds, so the tree
 * is pinned here rather than through either of them. The executor half is pinned too: a step's
 * own progress is the window between two reads of the invocation's list, and that window is
 * the only thing that attributes a point to the step that made it.
 */
import assert from 'assert';
import tap from 'tap';
import {TestExecutor, progressTree, type IProgressEntry, type StepArray} from './index.ts';

/** What a report would call each entry, in the order the step announced them. */
const namesOf = (entries: IProgressEntry[] | undefined): string[] =>
    (entries ?? []).map(entry =>
        entry.kind === 'point' ? entry.name : `${entry.discriminator} = ${entry.chosen}`,
    );

tap.test('progressTree', async t => {
    t.test('points announced outside any branch are steps in the order they happened', async () => {
        const tree = progressTree([
            {kind: 'point', name: 'total-calculated', timestamp: 1},
            {kind: 'point', name: 'order-created', timestamp: 2},
        ]);
        assert.deepEqual(
            tree.map(node => [node.name, node.kind]),
            [
                ['total-calculated', 'point'],
                ['order-created', 'point'],
            ],
        );
        assert.deepEqual(tree[0].children, [], 'and a point holds nothing');
    });

    t.test('a branch is the group of the points announced inside it', async () => {
        const mark = {
            discriminator: 'discount-tier',
            candidates: ['none', 'standard'],
            chosen: 'standard',
        };
        const tree = progressTree([
            {kind: 'point', name: 'total-calculated', timestamp: 1},
            {kind: 'region', ...mark, values: {total: 200}},
            {kind: 'point', name: 'discount-applied', timestamp: 2, regions: [mark]},
        ]);
        assert.deepEqual(
            tree.map(node => node.name),
            ['total-calculated', 'discount-tier = standard'],
            'the branch stands where it was taken, named by what was chosen',
        );
        assert.deepEqual(
            tree[1].children.map(node => node.name),
            ['discount-applied'],
            'with the point that sat in it under it',
        );
    });

    t.test('a branch taken inside a branch nests', async () => {
        const outer = {discriminator: 'outer', candidates: ['taken'], chosen: 'taken'};
        const inner = {discriminator: 'inner', candidates: ['only'], chosen: 'only'};
        const tree = progressTree([
            {kind: 'region', ...outer, values: {}},
            {kind: 'region', ...inner, values: {}, regions: [outer]},
            {kind: 'point', name: 'deep', timestamp: 1, regions: [outer, inner]},
        ]);
        assert.equal(tree[0].name, 'outer = taken');
        assert.equal(tree[0].children[0].name, 'inner = only');
        assert.equal(tree[0].children[0].children[0].name, 'deep');
    });

    t.test('a branch that announced nothing is still a group', async () => {
        const tree = progressTree([
            {
                kind: 'region',
                discriminator: 'route-selection',
                candidates: ['hubB', 'hold'],
                chosen: 'hold',
                values: {},
            },
        ]);
        assert.deepEqual(
            tree.map(node => node.name),
            ['route-selection = hold'],
            'the code went that way, and a report that dropped it would say otherwise',
        );
    });

    t.test('a branch whose run threw is drawn from the point that named it', async () => {
        const mark = {discriminator: 'boom', candidates: ['a', 'b'], chosen: 'a'};
        const tree = progressTree([
            // No `region` entry: a branch that never completed is not a decision, so the
            // recorder withdraws it — while the point announced inside it still says where it
            // was, and that is what the group is drawn from.
            {kind: 'point', name: 'half-done', timestamp: 1, regions: [mark]},
        ]);
        assert.deepEqual(
            tree.map(node => node.name),
            ['boom = a'],
        );
        assert.deepEqual(
            tree[0].children.map(node => node.name),
            ['half-done'],
        );
    });

    t.test('two branches taken the same way at the same level are one group', async () => {
        const mark = {discriminator: 'tier', candidates: ['a', 'b'], chosen: 'a'};
        const tree = progressTree([
            {kind: 'region', ...mark, values: {}},
            {kind: 'region', ...mark, values: {}},
            {kind: 'point', name: 'once', timestamp: 1, regions: [mark]},
        ]);
        assert.equal(tree.length, 1, 'the group is the chain of names, not the count of visits');
        assert.deepEqual(
            tree[0].children.map(node => node.name),
            ['once'],
        );
    });

    t.test('nothing announced is an empty tree', async () => {
        assert.deepEqual(progressTree(undefined), []);
        assert.deepEqual(progressTree([]), []);
    });
});

/** A test context that records the sub-tests and comments it is asked for, and nothing else. */
interface IRecordedTest {
    name: string;
    children: IRecordedTest[];
}

const recordingContext = (
    recorded: IRecordedTest[],
    comments: string[] = [],
): {
    test: (name: string, fn: (t: unknown) => unknown) => Promise<void>;
    comment: (text: string) => void;
} => ({
    test: async (name: string, fn: (t: unknown) => unknown) => {
        const node: IRecordedTest = {name, children: []};
        recorded.push(node);
        await fn(recordingContext(node.children, comments));
    },
    comment: (text: string) => {
        comments.push(text);
    },
});

tap.test('the executor renders a step’s progress as its own sub-tests', async t => {
    t.test('a step reports the window it announced in, and nothing else', async () => {
        const meta = {};
        const steps: StepArray = [
            async function announcesAPoint(assert, context) {
                const point: IProgressEntry = {kind: 'point', name: 'setup', timestamp: 1};
                context.$meta.progress = [point];
                return 'done';
            },
            async function takesABranch(assert, context) {
                const mark = {discriminator: 'tier', candidates: ['a', 'b'], chosen: 'a'};
                context.$meta.progress = [
                    ...(context.$meta.progress as IProgressEntry[]),
                    {kind: 'region', ...mark, values: {}},
                    {kind: 'point', name: 'inside', timestamp: 2, regions: [mark]},
                ];
                return 'done';
            },
            async function announcesNothing() {
                return 'done';
            },
        ];

        const executor = new TestExecutor({concurrency: 1});
        await executor.execute(steps, meta);
        const progress = executor.getProgress();

        assert.deepEqual(
            progress.steps.get('announcesAPoint')?.progress?.map(entry => entry.kind),
            ['point'],
        );
        assert.deepEqual(
            progress.steps.get('takesABranch')?.progress?.map(entry => entry.kind),
            ['region', 'point'],
            'including the branch and the point taken inside it',
        );
        assert.equal(
            progress.steps.get('announcesNothing')?.progress,
            undefined,
            'and a step that announced nothing carries no list at all',
        );
    });

    t.test('a step that resets the list still reports its own progress', async () => {
        const steps: StepArray = [
            async function first(assert, context) {
                context.$meta.progress = [
                    {kind: 'point', name: 'first-a', timestamp: 1},
                    {kind: 'point', name: 'first-b', timestamp: 2},
                ];
            },
            async function second(assert, context) {
                // The documented way a scenario scopes its own assertions — and it can leave
                // exactly as many entries as the step before it did.
                context.$meta.progress = [
                    {kind: 'point', name: 'second-a', timestamp: 3},
                    {kind: 'point', name: 'second-b', timestamp: 4},
                ];
            },
        ];

        const executor = new TestExecutor({concurrency: 1});
        await executor.execute(steps, {});
        const progress = executor.getProgress();

        assert.deepEqual(namesOf(progress.steps.get('first')?.progress), ['first-a', 'first-b']);
        assert.deepEqual(
            namesOf(progress.steps.get('second')?.progress),
            ['second-a', 'second-b'],
            'a replacement list is the step that made it, not an empty difference',
        );
    });

    t.test('a point is a comment and a branch is a sub-test', async () => {
        const recorded: IRecordedTest[] = [];
        const comments: string[] = [];
        const steps: StepArray = [
            async function order(assert, context) {
                const mark = {
                    discriminator: 'discount-tier',
                    candidates: ['standard'],
                    chosen: 'standard',
                };
                context.$meta.progress = [
                    ...((context.$meta.progress as IProgressEntry[]) ?? []),
                    {
                        kind: 'point',
                        name: 'total-calculated',
                        timestamp: 1,
                        data: {total: 200, itemCount: 2},
                    },
                    {kind: 'region', ...mark, values: {total: 200}},
                    {kind: 'point', name: 'discount-applied', timestamp: 2, regions: [mark]},
                ];
                return 'done';
            },
        ];

        const executor = new TestExecutor({concurrency: 1});
        await executor.execute(steps, {}, recordingContext(recorded, comments) as never);

        assert.deepEqual(
            recorded.map(node => node.name),
            ['order'],
            'the step itself is the only root the executor creates',
        );
        assert.deepEqual(
            recorded[0].children.map(node => node.name),
            ['discount-tier = standard'],
            'a branch is a test; a point is not',
        );
        assert.deepEqual(
            recorded[0].children[0].children.map(node => node.name),
            [],
            'and the point taken inside it is not a test either',
        );
        assert.deepEqual(
            comments,
            ['total-calculated: total=200, itemCount=2', 'discount-applied'],
            'the points read as comments, with the data that fits, in the order they happened',
        );
    });

    t.test('a registry with no progress announces nothing, and renders nothing', async () => {
        const recorded: IRecordedTest[] = [];
        const steps: StepArray = [async function plain() {}];

        const executor = new TestExecutor({concurrency: 1});
        await executor.execute(steps, {}, recordingContext(recorded) as never);

        assert.deepEqual(
            recorded.map(node => [node.name, node.children.length]),
            [['plain', 0]],
            'the golden snapshot suites depend on exactly this: no progress, no extra tests',
        );
    });
});
