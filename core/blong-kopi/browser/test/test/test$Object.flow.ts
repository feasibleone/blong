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
 * browser/test/test/test$Object.flow.ts — HTTP-level access control test.
 *
 * Runs against the live gateway (via the blong-test backend adapter) with
 * `gateway.authorize` enabled:
 *  - no token               → 401
 *  - `testViewer` (no `$subject` capability) → 403
 *  - `testAdmin` (Admin → $subjectManage)    → 200 (add + find succeed)
 *
 * Registered as the `test.$object.flow` group (browser-test.ts watch.test).
 */
export default handler(
    ({lib: {group}, handler: {loginTokenCreate, $subject$ObjectAdd, $subject$ObjectFind}}) => ({
        test$ObjectFlow: ({name = '$subject flow browser'}: {name?: string} = {}) =>
            group(name)([
                // 1. No auth: protected `$subject` call without any token → 401.
                async function httpNoAuth(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    try {
                        await $subject$ObjectFind({paging: {pageNumber: 1, pageSize: 10}}, $meta);
                        assert.fail('$subject$ObjectFind should have thrown without auth');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(status, 401, '$subject.$object.find without auth returns 401');
                    }
                },

                // 2. Auth denied: testViewer has no `$subject` capability → 403.
                async function httpAuthDeny(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate(
                        {username: 'testViewer', password: 'testPassword'},
                        $meta,
                    );
                    try {
                        await $subject$ObjectAdd(
                            {
                                $object: {
                                    $objectName: `ENT-DENIED-${Date.now()}`,
                                    $objectStatus: 'draft',
                                },
                            },
                            $meta,
                        );
                        assert.fail('$subject$ObjectAdd should have thrown for unauthorized user');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(
                            status,
                            403,
                            '$subject.$object.add without permission returns 403',
                        );
                    }
                },

                // 3. Auth allowed: testAdmin has $subjectManage → add + find succeed.
                async function httpAuthPass(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    const result = await $subject$ObjectAdd<{
                        $object: {$objectId: number};
                    }>(
                        {
                            $object: {
                                $objectName: `ENT-BROWSER-${Date.now()}`,
                                $objectStatus: 'draft',
                            },
                            details: [{lineName: 'Item', lineQuantity: 1}],
                        },
                        $meta,
                    );
                    assert.ok(result.$object.$objectId, 'authorized $object add succeeds');

                    const resultFind = await $subject$ObjectFind<Array<{$objectId: number}>>(
                        {paging: {pageNumber: 1, pageSize: 100}},
                        $meta,
                    );
                    assert.ok(
                        resultFind.some(item => item.$objectId === result.$object.$objectId),
                        'authorized $object find succeeds',
                    );
                },
            ]),
    }),
);
