/**
 * Context Snapshotting — Framework Usage Demo
 *
 * Demonstrates the five snapshotting strategies available through blong-gogo's
 * handler / group() API.  The framework injects assert.snapshot() into every
 * step, chains checkpoint markers are processed by the TestExecutor, and
 * chain-level mask is configured via the second argument to group().
 *
 * Strategies shown:
 *   A — autoSnapshot: true   (group config — every step auto-snapshotted)
 *   B — ['*'] checkpoint     (one marker at end, full context snapshot)
 *   C — ['s1','s2']          (phase markers, only named steps snapshotted)
 *   D — assert.snapshot()    (per-step no-args, most granular)
 *   Hybrid                   (explicit asserts + assert.snapshot() + ['*'])
 *
 * Snapshot files: tap-snapshots/ alongside the suite index.test.ts
 * Regenerate:     TAP_SNAPSHOT=1 node --import tsx index.test.ts
 */
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({
        lib: {group, checkpoint},
        handler: {testLoginTokenCreate, testUserAdminLogin, subjectNumberSum, subjectAge},
    }) => ({
        // ── Strategy A ──────────────────────────────────────────────────────
        // autoSnapshot: true — every step return value is snapshotted under
        // the step function name.  No assert.snapshot() calls needed anywhere.
        // Ideal for migrating an existing test collection: add the config flag
        // and get regression coverage with zero per-step changes.
        testSnapshotStrategyA: ({name = 'snapshot — A autoSnapshot'}: {name?: string}, $meta: IMeta) =>
            group(name, {autoSnapshot: true})([
                testLoginTokenCreate({}, $meta),
                testUserAdminLogin({}, $meta),

                async function calculateAge(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // return value snapshotted automatically as 'calculateAge'
                    return subjectAge({birthDate: '1990-01-15'}, $meta);
                },

                async function sumNumbers(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // return value snapshotted automatically as 'sumNumbers'
                    return subjectNumberSum([100, 20, 3], $meta);
                },
            ]),

        // ── Strategy B ──────────────────────────────────────────────────────
        // ['*'] checkpoint — one declarative marker at the end of the array.
        // The executor waits for all steps then snapshots the full accumulated
        // context.  Object.assign gives the snapshot a stable name.
        testSnapshotStrategyB: ({name = 'snapshot — B checkpoint *'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                testLoginTokenCreate({}, $meta),
                testUserAdminLogin({}, $meta),

                async function calculateAge(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    return subjectAge({birthDate: '1990-01-15'}, $meta);
                },

                async function sumNumbers(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    return subjectNumberSum([100, 20, 3], $meta);
                },

                // Snapshot the whole context — both steps captured in one entry
                checkpoint('math-results'),
            ]),

        // ── Strategy C ──────────────────────────────────────────────────────
        // Phase checkpoints — named markers capture subsets of the context at
        // phase boundaries.  The executor waits ONLY for the listed steps
        // so parallel steps in other phases keep running.
        testSnapshotStrategyC: ({name = 'snapshot — C phase checkpoints'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                testLoginTokenCreate({}, $meta),
                testUserAdminLogin({}, $meta),

                // Phase 1: independent parallel steps
                async function calculateAge(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    return subjectAge({birthDate: '1990-01-15'}, $meta);
                },
                async function sumSmall(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    return subjectNumberSum([1, 2, 3], $meta);
                },

                // Snapshot phase 1 — only waits for calculateAge & sumSmall
                checkpoint('phase1', 'calculateAge', 'sumSmall'),

                // Phase 2: downstream steps
                async function sumLarge(_assert: IAssert, {$meta}: {$meta: IMeta}) {
                    return subjectNumberSum([1000, 200, 30, 4], $meta);
                },

                // Snapshot phase 2
                checkpoint('phase2', 'sumLarge'),
            ]),

        // ── Strategy D ──────────────────────────────────────────────────────
        // assert.snapshot() no-args — call inside a step; the executor captures
        // the return value and calls matchSnapshot(result, stepName) after the
        // function resolves.  The step name becomes the snapshot key.
        testSnapshotStrategyD: ({name = 'snapshot — D per-step'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                testLoginTokenCreate({}, $meta),
                testUserAdminLogin({}, $meta),

                async function calculateAge(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await subjectAge({birthDate: '1990-01-15'}, $meta);
                    assert.snapshot(); // deferred: captured under 'calculateAge'
                    return result;
                },

                async function sumNumbers(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await subjectNumberSum([100, 20, 3], $meta);
                    assert.snapshot(); // deferred: captured under 'sumNumbers'
                    return result;
                },
            ]),

        // ── Hybrid (recommended for production) ─────────────────────────────
        // assert.equal / assert.rejects for business rules (explicit intent)
        // assert.snapshot() in sentinel steps (lock in their full shape)
        // ['*'] at the end for comprehensive regression coverage
        testSnapshotHybrid: ({name = 'snapshot — hybrid'}: {name?: string}, $meta: IMeta) =>
            group(name)([
                testLoginTokenCreate({}, $meta),
                testUserAdminLogin({}, $meta),

                async function calculateAge(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await subjectAge({birthDate: '1990-01-15'}, $meta);
                    // Business rule: explicit assertion
                    assert.ok(result.age >= 0, 'age must be non-negative');
                    // Structural regression lock
                    assert.snapshot();
                    return result;
                },

                async function sumNumbers(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const total = await subjectNumberSum([1000, 200, 30, 4], $meta);
                    // Business rule: the sum must be exactly right
                    assert.equal(total, 1234, 'sum must be 1234');
                    return total;
                },

                async function errorCase(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // Negative values must be rejected
                    await assert.rejects(
                        subjectNumberSum([-1], {
                            ...$meta,
                            expect: 'subjectSum',
                        }) as Promise<unknown>,
                        {type: 'subjectSum'},
                        'negative numbers must be rejected',
                    );
                    return {negativeRejected: true};
                },

                // End-of-chain full context snapshot for regression
                checkpoint('hybrid-context'),
            ]),
    }),
);
