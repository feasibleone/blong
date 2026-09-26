/**
 * The framework's two progress-point handles (PRD R11/R26).
 *
 * A checkpoint reports a moment; a decision selects a branch. That difference is the whole
 * reason one is optional and the other is not, so it is pinned here: a checkpoint exists
 * only where points are recorded, a decision exists in every mode, and both reach the log
 * through the attachable vocabulary — degrading to nothing and to a plain selection where
 * no emitter is attached, because a dispatch path must never reach the emitter's ambient
 * scope (F-197).
 */
import type {
    IMeta,
    IProgressEntry,
    IProgressPoint,
    IProgressRegion,
} from '@feasibleone/blong/types';
import {
    attachSemanticVocabulary,
    detachSemanticVocabulary,
} from '@feasibleone/semantic-log/attachable';
import * as semantic from '@feasibleone/semantic-log/emitter';
import t from 'tap';
import {createAttachCheckpoint} from './checkpoint.ts';

const MODES = ['production', 'debug', 'test'] as const;

/** The points an invocation recorded, in the order it announced them. */
const pointsOf = (progress: IProgressEntry[] | undefined): IProgressPoint[] =>
    (progress ?? []).filter((entry): entry is IProgressPoint => entry.kind === 'point');

/** The branches an invocation took, in the order it took them. */
const regionsOf = (progress: IProgressEntry[] | undefined): IProgressRegion[] =>
    (progress ?? []).filter((entry): entry is IProgressRegion => entry.kind === 'region');

t.test('a branch is taken and its rationale kept, in every mode', t => {
    for (const mode of MODES) {
        const meta: IMeta = {};
        createAttachCheckpoint(mode)(meta);
        const result = meta.decide?.('rate-within-limit', {rate: 2}, [
            {name: 'decline', when: values => (values.rate as number) > 1, run: () => 'declined'},
            {name: 'accept', when: () => true, run: () => 'accepted'},
        ]);
        t.equal(result, 'declined', `${mode}: the branch is taken`);
        t.same(
            meta.progress,
            [
                {
                    kind: 'region',
                    discriminator: 'rate-within-limit',
                    candidates: ['decline', 'accept'],
                    chosen: 'decline',
                    values: {rate: 2},
                },
            ],
            `${mode}: and the invocation keeps which one it was`,
        );
    }
    t.end();
});

t.test('a checkpoint exists only where points are recorded', t => {
    const production: IMeta = {};
    createAttachCheckpoint('production')(production);
    t.notOk(
        production.checkpoint,
        'absent in production, which is what makes the `?.` call cost nothing',
    );
    t.ok(production.decide, 'while the branch helper is there, because a branch cannot be skipped');

    const debug: IMeta = {};
    createAttachCheckpoint('debug')(debug);
    debug.checkpoint?.('total-calculated', {total: 200});
    const [point] = pointsOf(debug.progress);
    t.equal(debug.progress?.length, 1, 'recorded where points are');
    t.equal(point?.name, 'total-calculated');
    t.same(point?.data, {total: 200});
    t.type(point?.timestamp, 'number', 'and stamped when it happened');
    t.end();
});

t.test('a point announced inside a branch names the branch it sat in', t => {
    attachSemanticVocabulary(semantic);
    t.teardown(() => detachSemanticVocabulary());
    const meta: IMeta = {};
    createAttachCheckpoint('test')(meta);
    meta.checkpoint?.('before-the-branch');
    meta.decide?.('rate-within-limit', {rate: 2}, [
        {
            name: 'decline',
            when: () => true,
            run: () => {
                meta.checkpoint?.('declined');
                return 'declined';
            },
        },
        {name: 'accept', when: () => true, run: () => 'accepted'},
    ]);

    t.same(
        meta.progress?.map(entry => entry.kind),
        ['point', 'region', 'point'],
        'the branch is announced where it was taken, between the points on either side of it',
    );
    t.same(
        pointsOf(meta.progress).map(point => point.regions?.length ?? 0),
        [0, 1],
        'and only the point announced inside the branch names it, which is what nests a report',
    );
    t.same(
        pointsOf(meta.progress)[1]?.regions,
        [
            {
                discriminator: 'rate-within-limit',
                candidates: ['decline', 'accept'],
                chosen: 'decline',
            },
        ],
        'by the names of the branch, not by a position the log mints for itself',
    );
    t.same(
        regionsOf(meta.progress)[0]?.regions,
        undefined,
        'while the branch itself names nothing above it',
    );
    t.end();
});

t.test('a branch taken inside a branch names the one it sits in', t => {
    attachSemanticVocabulary(semantic);
    t.teardown(() => detachSemanticVocabulary());
    const meta: IMeta = {};
    createAttachCheckpoint('test')(meta);
    meta.decide?.('outer', {}, [
        {
            name: 'taken',
            when: () => true,
            run: () =>
                meta.decide?.('inner', {}, [{name: 'only', when: () => true, run: () => 'inner'}]),
        },
    ]);

    t.same(
        regionsOf(meta.progress).map(region => region.discriminator),
        ['outer', 'inner'],
        'both are announced, outermost first',
    );
    t.same(
        regionsOf(meta.progress)[1]?.regions?.map(region => region.discriminator),
        ['outer'],
        'and the nested one is in the chain of the one that encloses it',
    );
    t.end();
});

t.test('a checkpoint is announced to the log, and announces nothing without one', t => {
    detachSemanticVocabulary();
    const detached: IMeta = {};
    createAttachCheckpoint('test')(detached);
    detached.checkpoint?.('no-log');
    t.equal(
        semantic.takePoints(),
        undefined,
        'nothing is announced where no emitter is attached: the degradation is the whole point',
    );

    attachSemanticVocabulary(semantic);
    t.teardown(() => detachSemanticVocabulary());
    const attached: IMeta = {};
    createAttachCheckpoint('test')(attached);
    attached.checkpoint?.('total-calculated', {total: 200});
    t.same(
        semantic.takePoints(),
        [{name: 'total-calculated', data: {total: 200}}],
        'PRD R26: the milestone reaches the log, so a diagram can draw it as a note',
    );
    t.equal(semantic.takePoints(), undefined, 'and is taken once, by the record that carries it');
    t.end();
});

t.test('a decision is announced to the log too, and still selects without one', t => {
    detachSemanticVocabulary();
    const detached: IMeta = {};
    createAttachCheckpoint('test')(detached);
    t.equal(
        detached.decide?.('d', {}, [{name: 'only', when: () => true, run: () => 7}]),
        7,
        'the branch is taken with nothing attached',
    );
    t.equal(semantic.takeDecision(), undefined, 'and no rationale is staged to record');

    attachSemanticVocabulary(semantic);
    t.teardown(() => detachSemanticVocabulary());
    const attached: IMeta = {};
    createAttachCheckpoint('test')(attached);
    attached.decide?.('route-selection', {}, [
        {name: 'hubB', when: () => true, run: () => 'hubB'},
        {name: 'hold', when: () => true, run: () => undefined},
    ]);
    t.same(
        semantic.takeDecision()?.candidates,
        ['hubB', 'hold'],
        'the rationale is staged for the next record, in evaluation order (PRD R11)',
    );
    t.end();
});

t.test('no branch matching is a recorded non-choice', t => {
    const meta: IMeta = {};
    createAttachCheckpoint('test')(meta);
    t.equal(meta.decide?.('never', {}, [{name: 'a', when: () => false, run: () => 1}]), undefined);
    t.equal(regionsOf(meta.progress)[0]?.chosen, 'none', 'recorded as `none` rather than lost');
    t.end();
});

t.test('each predicate is evaluated once', t => {
    const meta: IMeta = {};
    createAttachCheckpoint('test')(meta);
    let evaluations = 0;
    meta.decide?.('counting', {}, [
        {
            name: 'only',
            when: () => {
                evaluations++;
                return true;
            },
            run: () => 'taken',
        },
    ]);
    t.equal(evaluations, 1, 'the `run` is wrapped, not the predicate re-evaluated');
    t.end();
});

t.test('a branch that throws records nothing', t => {
    const meta: IMeta = {};
    createAttachCheckpoint('test')(meta);
    t.throws(
        () =>
            meta.decide?.('boom', {}, [
                {
                    name: 'a',
                    when: () => true,
                    run: () => {
                        throw new Error('handler failed');
                    },
                },
            ]),
        /handler failed/,
        'the failure is not swallowed',
    );
    t.notOk(
        meta.progress,
        'a decision that never completed is not a decision, so nothing is recorded',
    );
    t.end();
});

t.test('attaching twice does not replace a handle already there', t => {
    const meta: IMeta = {};
    const attach = createAttachCheckpoint('test');
    attach(meta);
    const first = meta.decide;
    attach(meta);
    t.equal(meta.decide, first, 'a dispatch that was already prepared is left alone');
    t.end();
});
