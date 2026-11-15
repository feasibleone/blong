import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** A `find` result is a plain array through the adapter — tolerate the wrapped shape too. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const items = (result as {items?: unknown} | undefined)?.items;
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
}

/** The `sub` claim a login answers, which is the actor every handler reads. */
function actorOf(token: string): string {
    return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString())['sub'] as string;
}

type Key = {id: string};

/**
 * `test.scope` — the party scopes a caller holds, walked through the seeded hierarchy.
 *
 * The fixture is the one `test.acl.flow` uses (`9-partyHierarchyMerge`): Global Bank Corp has a Head
 * Office, Retail Branch sits under it, and John Doe is in Retail Branch. `testViewer` is the account
 * that person is the profile of, so signing in as it is what makes the walk start at the branch and
 * end at the organisation — the point of reading the graph rather than a column (@@D-836).
 *
 * The last step is the refusal that matters most: a caller with no `hasProfile` edge holds nothing,
 * so a blob scoped to anybody stays shut.
 *
 * Registered as the `test.scope` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            partyOrganizationFind,
            partyPersonFind,
            partyScopeGrant,
            partyUnitFind,
        },
    }) => ({
        testScope: () =>
            group('scope')([
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testViewer', password: 'testPassword'},
                        $meta,
                    );
                    const actorId = actorOf(result.access_token);
                    assert.ok(actorId, 'the fixture account signs in');
                    return {actorId};
                },

                async function keys(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const system = {...$meta, auth: undefined};
                    const first = async (
                        find: unknown,
                        filterBy: object,
                        keyName: string,
                        method: string,
                    ): Promise<Key> => {
                        const rows = rowsOf(
                            await (find as (p: object, m: object) => Promise<unknown>)(
                                {filterBy, paging: {pageNumber: 1, pageSize: 10}},
                                {...system, method},
                            ),
                        );
                        assert.ok(rows.length >= 1, `the fixture holds a ${method} record`);
                        return {id: rows[0]![keyName] as string};
                    };
                    return {
                        doe: await first(partyPersonFind, {lastName: 'Doe'}, 'personId', 'person'),
                        retail: await first(
                            partyUnitFind,
                            {unitName: 'Retail Branch'},
                            'unitId',
                            'retail',
                        ),
                        head: await first(
                            partyUnitFind,
                            {unitName: 'Head Office'},
                            'unitId',
                            'head',
                        ),
                        globalBank: await first(
                            partyOrganizationFind,
                            {legalName: 'Global Bank Corp'},
                            'organizationId',
                            'organization',
                        ),
                    };
                },

                async function scopes(
                    assert: IAssert,
                    {
                        $meta,
                        login,
                        keys,
                    }: {
                        $meta: IMeta;
                        login: Promise<{actorId: string}>;
                        keys: Promise<Record<string, Key>>;
                    },
                ) {
                    const {actorId} = await login;
                    const {doe, retail, head, globalBank} = await keys;
                    const answer = (await partyScopeGrant({}, {
                        ...$meta,
                        auth: {actorId},
                    } as unknown as IMeta)) as {scopes: string[]};
                    assert.deepEqual(
                        answer.scopes,
                        [
                            `party:org:${globalBank.id}`,
                            `party:person:${doe.id}`,
                            `party:unit:${head.id}`,
                            `party:unit:${retail.id}`,
                        ].sort(),
                        'the person, its branch, the office above it and the organisation',
                    );
                    return {scopes: answer.scopes};
                },

                async function noProfileNoScopes(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // An id no user holds: the account does not exist, so no `hasProfile` edge does
                    // either, which is exactly the caller a scope must refuse.
                    const stranger = Buffer.alloc(16, 7).toString('base64');
                    const answer = (await partyScopeGrant({}, {
                        ...$meta,
                        auth: {actorId: stranger},
                    } as unknown as IMeta)) as {scopes: string[]};
                    assert.deepEqual(answer.scopes, [], 'a caller with no person holds no scope');

                    const quiet = (await partyScopeGrant({}, {
                        ...$meta,
                        auth: undefined,
                    } as IMeta)) as {
                        scopes: string[];
                    };
                    assert.deepEqual(
                        quiet.scopes,
                        [],
                        'and so does a call that names nobody at all',
                    );

                    const unknown = (await partyScopeGrant({personId: stranger}, {
                        ...$meta,
                        auth: undefined,
                    } as IMeta)) as {scopes: string[]};
                    assert.deepEqual(
                        unknown.scopes,
                        [],
                        'and a system call naming an unknown person',
                    );
                    return {done: true};
                },
            ]),
    }),
);
