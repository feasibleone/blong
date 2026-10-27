import {handler, type IAssert, type IMeta} from '@feasibleone/blong';

import {
    approveRelease,
    tokensMatch,
    type IApproveErrors,
} from '../../../orchestrator/controller/kustomizeReleaseApprove.ts';
import type {IReleaseNotify} from '../../../orchestrator/controller/kustomizeReleaseNotify.ts';

/**
 * server/test/test/testReleaseApprove.ts — the release gate, without a cluster.
 *
 * The route's whole reason to exist is the order of its refusals: a missing operator token, then a
 * wrong caller token, then a malformed announcement, and only then the write. The decision is
 * exported so those four steps are asserted here, with a fake notify, rather than by pointing a
 * valid token at the dev cluster.
 *
 * Registered as the `test.release.approve` group (`integration.watch.test` in `index.ts`).
 */
const refusal = (type: string): Error => Object.assign(new Error(type), {type});

const errors: IApproveErrors = {
    tokenMissing: () => refusal('kustomize.release.tokenMissing'),
    tokenMismatch: () => refusal('kustomize.release.tokenMismatch'),
    malformed: reason => refusal(`kustomize.release.malformed:${reason}`),
};

const announcement = (token: string): Parameters<typeof approveRelease>[0] => ({
    token,
    suite: 'blong-sport',
    version: '0.1.1',
    artifactUrl: 'https://example.test/sport.zip',
    artifactDigest: 'a'.repeat(64),
});

const refusalOf = async (call: Promise<unknown>): Promise<string | undefined> => {
    try {
        await call;
        return undefined;
    } catch (error) {
        return (error as {type?: string}).type;
    }
};

export default handler(({lib: {group}}) => ({
    testReleaseApprove: ({name = 'release approve'}: {name?: string} = {}) =>
        group(name)([
            async function aMissingOperatorTokenRefuses(assert: IAssert) {
                assert.equal(
                    await refusalOf(
                        approveRelease(announcement('given'), undefined, async () => ({}), {} as IMeta, errors),
                    ),
                    'kustomize.release.tokenMissing',
                    'an operator with no token is closed, not open',
                );
            },

            async function aWrongTokenIsRefusedBeforeTheWrite(assert: IAssert) {
                let called = false;
                const notify = async (): Promise<unknown> => {
                    called = true;
                    return {};
                };
                assert.equal(
                    await refusalOf(
                        approveRelease(announcement('wrong'), 'right', notify, {} as IMeta, errors),
                    ),
                    'kustomize.release.tokenMismatch',
                    'a wrong token is the mismatch refusal',
                );
                assert.equal(called, false, 'and nothing is written');
                assert.equal(
                    tokensMatch('right', 'right'),
                    true,
                    'the comparison accepts an equal token',
                );
                assert.equal(tokensMatch('short', 'a longer token'), false, 'and rejects a length');
            },

            async function anIncompleteAnnouncementIsMalformed(assert: IAssert) {
                assert.equal(
                    await refusalOf(
                        approveRelease(
                            {...announcement('right'), suite: ''},
                            'right',
                            async () => ({}),
                            {} as IMeta,
                            errors,
                        ),
                    ),
                    'kustomize.release.malformed:suite and version are required',
                    'a token is not an announcement',
                );
            },

            async function aValidTokenDelegatesWithoutTheSecret(assert: IAssert) {
                let seen: IReleaseNotify | undefined;
                const answer = await approveRelease(
                    announcement('right'),
                    'right',
                    async release => {
                        seen = release;
                        return {updated: true};
                    },
                    {} as IMeta,
                    errors,
                );
                assert.deepEqual(answer, {updated: true}, 'the notify handler answers');
                assert.deepEqual(
                    seen,
                    {
                        suite: 'blong-sport',
                        version: '0.1.1',
                        artifactUrl: 'https://example.test/sport.zip',
                        artifactDigest: 'a'.repeat(64),
                    },
                    'and receives the release unchanged, with the token spent',
                );
            },
        ]),
}));
