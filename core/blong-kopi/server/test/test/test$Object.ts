import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/test$Object.ts — server-side `$subject.$object` flow test.
 *
 * 1. Logs in as `testAdmin` through blong-access (`loginTokenCreate`), asserting
 *    the JWT permission map contains the `$subject` actions (RBAC seed wiring).
 * 2. Creates a `$object` with lines (`$subject.$object.add`) — asserts success.
 * 3. Lists `$objects` (`$subject.$object.find`) — asserts the created one is
 *    returned.
 *
 * Registered as the `test.$object` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({lib: {group}, handler: {loginTokenCreate, $subject$ObjectAdd, $subject$ObjectFind}}) => ({
        test$Object: ({name = '$subject flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Authenticate via blong-access and verify the permission map.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        access_token: string;
                        permissions: string[];
                    }>({username: 'testAdmin', password: 'testPassword'}, $meta);
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'login returns a non-empty access token',
                    );
                    assert.ok(
                        result.permissions.includes('$subject$ObjectAdd'),
                        'testAdmin permission map includes $subject$ObjectAdd',
                    );
                    return result;
                },

                // 2. Create a `$object` with its `line` detail rows (sibling
                // arrays) — assert both persist.
                async function add$Object(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await $subject$ObjectAdd<{
                        $object: {$objectId: number; $objectStatus: string};
                        line: Array<{lineId: number; lineName: string}>;
                    }>(
                        {
                            $object: {
                                $objectName: `ENT-TEST-${Date.now()}`,
                                $objectStatus: 'draft',
                            },
                            line: [
                                {lineName: 'Widget', lineQuantity: 2},
                                {lineName: 'Gadget', lineQuantity: 1},
                            ],
                        },
                        $meta,
                    );
                    assert.ok(result.$object.$objectId, '$object add succeeds');
                    assert.equal(result.$object.$objectStatus, 'draft', '$object status is draft');
                    assert.equal(result.line.length, 2, 'two detail rows created');
                    return result.$object;
                },

                // 3. Find `$objects` — the added one must be in the result set.
                async function find$Object(
                    assert: IAssert,
                    {
                        $meta,
                        add$Object: created,
                    }: {
                        $meta: IMeta;
                        add$Object: Awaited<{$objectId: number}>;
                    },
                ) {
                    const $object = await created;
                    const result = await $subject$ObjectFind<
                        Array<{$objectId: number; $objectName: string}>
                    >({paging: {pageNumber: 1, pageSize: 100}}, $meta);
                    assert.ok(
                        result.some(item => item.$objectId === $object.$objectId),
                        '$object find returns the added $object',
                    );
                    return result;
                },
            ]),
    }),
);
