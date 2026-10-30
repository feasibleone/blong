import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Extract the HTTP status code from an error thrown by the handler proxy
 * (JSON-RPC codec or MLE errorReceive path).
 */
function getHttpStatus(err: unknown): number | undefined {
    const e = err as Record<string, unknown>;
    return (
        ((e.res as Record<string, unknown>)?.statusCode as number | undefined) ??
        (e.statusCode as number | undefined) ??
        ((e.params as Record<string, unknown>)?.code as number | undefined)
    );
}

/**
 * browser/test/test/testAthlete.flow.ts — HTTP-level access control test.
 *
 * Runs against the live gateway (via the blong-test backend adapter) with
 * `gateway.authorize` enabled:
 *  - no token               → 401
 *  - `testViewer` (no `sport` capability) → 403
 *  - `testAdmin` (Admin → sportManage)    → 200 (add + find succeed)
 *
 * Registered as the `test.athlete.flow` group (browser-test.ts watch.test).
 */
export default handler(
    ({lib: {group}, handler: {loginTokenCreate, sportAthleteAdd, sportAthleteFind}}) => ({
        testAthleteFlow: ({name = 'sport flow browser'}: {name?: string} = {}) =>
            group(name)([
                // 1. No auth: protected `sport` call without any token → 401.
                async function httpNoAuth(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    try {
                        await sportAthleteFind(
                            {paging: {pageNumber: 1, pageSize: 10}},
                            {...$meta, expect: 'gateway.jwtMissingHeader'},
                        );
                        assert.fail('sportAthleteFind should have thrown without auth');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(status, 401, 'sport.athlete.find without auth returns 401');
                    }
                },

                // 2. Auth denied: testViewer has no `sport` capability → 403.
                async function httpAuthDeny(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate(
                        {username: 'testViewer', password: 'testPassword'},
                        $meta,
                    );
                    try {
                        await sportAthleteAdd(
                            {
                                athlete: {
                                    firstName: 'Denied',
                                    lastName: 'User',
                                    athleteStatus: 'active',
                                },
                            },
                            {...$meta, expect: 'gateway.notAllowed'},
                        );
                        assert.fail('sportAthleteAdd should have thrown for unauthorized user');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(
                            status,
                            403,
                            'sport.athlete.add without permission returns 403',
                        );
                    }
                },

                // 3. Auth allowed: testAdmin has sportManage → add + find succeed.
                async function httpAuthPass(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    const personName = `Browser Athlete ${Date.now()}`;
                    const result = await sportAthleteAdd<{
                        athlete: {athleteId: string; personName: string};
                    }>(
                        {
                            athlete: {
                                personName,
                                firstName: 'Browser',
                                lastName: 'Athlete',
                                athleteStatus: 'active',
                            },
                        },
                        $meta,
                    );
                    assert.ok(result.athlete.athleteId, 'authorized athlete add succeeds');

                    // Filter by the row this run created instead of paging the
                    // whole table: the table keeps growing between runs, so page
                    // 1 of an unfiltered find stops containing the new row once
                    // there are more rows than pageSize.
                    const resultFind = await sportAthleteFind<
                        Array<{athleteId: string; personName: string}>
                    >(
                        {
                            paging: {pageNumber: 1, pageSize: 10},
                            filterBy: {athleteId: result.athlete.athleteId},
                        },
                        $meta,
                    );
                    assert.ok(
                        resultFind.some(item => item.athleteId === result.athlete.athleteId),
                        'authorized athlete find succeeds',
                    );
                },
            ]),
    }),
);
