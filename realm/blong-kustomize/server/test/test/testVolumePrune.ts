import {type IAssert, handler} from '@feasibleone/blong';
import {retentionDecision} from '../../../orchestrator/controller/kustomizeVolumePrune.ts';

/**
 * server/test/test/testVolumePrune.ts — the retention decision.
 *
 * The handler is a thin wrapper over this: it reads the versions off the labels and hands them here.
 * That split exists because of what the handler's first live run showed — its adapter lookup had been
 * spelled in camel case since it was written, the proxy split the name differently, and nothing
 * noticed because nothing called it (T-245). The half that needs no cluster is the half worth
 * pinning: which versions are kept, which are candidates, and what a retention that makes no sense
 * means.
 *
 * Registered as the `test.volume.prune` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testVolumePrune: ({name = 'volume prune'}: {name?: string} = {}) =>
        group(name)([
            async function theOldestAreTheCandidates(assert: IAssert) {
                assert.deepEqual(
                    retentionDecision(['1.0.0', '1.1.0', '1.2.0', '1.3.0'], 3),
                    {prune: ['1.0.0'], retain: ['1.1.0', '1.2.0', '1.3.0']},
                    'the newest `retention` are kept and the rest are candidates',
                );
                assert.deepEqual(
                    retentionDecision(['1.0.0', '1.1.0'], 3),
                    {prune: [], retain: ['1.0.0', '1.1.0']},
                    'a suite with fewer versions than the retention prunes nothing',
                );
                assert.deepEqual(
                    retentionDecision(['1.0.0', '1.0.0', '1.1.0'], 1),
                    {prune: ['1.0.0'], retain: ['1.1.0']},
                    'and one version means one entry however many objects carry it',
                );
            },

            async function aRetentionThatMakesNoSenseKeepsSomething(assert: IAssert) {
                // Zero or negative would delete the version that is running, which nobody asks for on
                // purpose — and a suite with nothing left to roll back to is not a state a
                // maintenance command should be able to reach.
                assert.deepEqual(
                    retentionDecision(['1.0.0', '1.1.0'], 0),
                    {prune: ['1.0.0'], retain: ['1.1.0']},
                    'zero keeps the newest rather than pruning everything',
                );
                assert.deepEqual(
                    retentionDecision(['1.0.0'], -5),
                    {prune: [], retain: ['1.0.0']},
                    'and a negative retention is not an instruction to delete',
                );
                assert.deepEqual(
                    retentionDecision([], undefined),
                    {prune: [], retain: []},
                    'while a suite with no labelled claim at all has nothing to decide',
                );
            },
        ]),
}));
