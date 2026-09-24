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
import type {IMeta} from '@feasibleone/blong/types';
import {
    attachSemanticVocabulary,
    detachSemanticVocabulary,
} from '@feasibleone/semantic-log/attachable';
import * as semantic from '@feasibleone/semantic-log/emitter';
import t from 'tap';
import {createAttachCheckpoint} from './checkpoint.ts';

const MODES = ['production', 'debug', 'test'] as const;

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
            meta.decisions,
            [
                {
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
    t.equal(debug.checkpoints?.length, 1, 'recorded where points are');
    t.equal(debug.checkpoints?.[0]?.name, 'total-calculated');
    t.same(debug.checkpoints?.[0]?.data, {total: 200});
    t.type(debug.checkpoints?.[0]?.timestamp, 'number', 'and stamped when it happened');
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
    t.equal(meta.decisions?.[0]?.chosen, 'none', 'and it is recorded as `none` rather than lost');
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
        meta.decisions,
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
