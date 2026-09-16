import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Server-side (tap) test flow for record-level authorization (`test.acl.flow`).
 *
 * Everything is asserted against the seeded party hierarchy
 * (`meta/dbTest/9-partyHierarchyMerge.yaml` + `99-accessAuthorizationMerge.yaml`):
 *
 * ```
 * Global Bank Corp ── Head Office ──┬── Retail Branch   (John Doe)
 *                                   └── Corporate Branch (Jane Smith)
 *                    (Carlos Garcia sits in Head Office)
 * FinServe Solutions Ltd ── FinServe Branch             (Alice Brown)
 * ```
 *
 * The `Admin` role (user `testAdmin`) holds `hasScope` on **Head Office** and on
 * **Global Bank Corp**, so:
 *  - John Doe and Carlos Garcia are implicitly allowed (the grant on Head Office
 *    reaches the Retail Branch records through `isPartOf`);
 *  - Jane Smith is implicitly allowed too, but three explicit `deny` rows forbid
 *    her — a deny always wins over an implicit allow;
 *  - Alice Brown is out of scope entirely (her unit belongs to an organization
 *    the role has no grant on).
 *
 * The list path is a filter, `get` hides denied records as not-found, writes are
 * refused, `add` is checked against the submitted unit, and
 * `access.session.verify` requires the record for a guarded entity.
 *
 * Registered as the `test.acl.flow` group (`integration.watch.test` in index.ts).
 */
function decodeJwtClaim(token: string, claim: string): string {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString())[claim] as string;
}

/** A `find` result is a plain array through the adapter — tolerate the wrapped shape too. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const items = (result as {items?: unknown} | undefined)?.items;
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
}

type Keys = {
    john: string;
    jane: string;
    alice: string;
    retail: string;
    finServe: string;
    globalBank: string;
    finServeOrg: string;
};

export default handler(
    ({
        lib: {group, crockfordDecode},
        handler: {
            loginTokenCreate,
            partyPersonFind,
            partyPersonGet,
            partyPersonAdd,
            partyPersonEdit,
            partyPersonRemove,
            partyUnitFind,
            partyOrganizationFind,
            partyOrganizationGet,
            accessSessionVerify,
            accessUserGet,
            accessRoleEdit,
            accessRoleGet,
            accessAclAdd,
            accessDropdownList,
        },
    }) => ({
        testAclFlow: ({name = 'acl flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Authenticate as `testAdmin` (Admin role) and decode the
                //    actor + session ids the handlers take from `$meta.auth`.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    const actorId = decodeJwtClaim(result.access_token, 'sub');
                    const sessionId = decodeJwtClaim(result.access_token, 'ses');
                    assert.ok(actorId, 'actor id decoded from the access token');
                    assert.ok(sessionId, 'session id decoded from the access token');
                    return {actorId, sessionId};
                },

                // 2. A second, unprivileged session.  The `Customer` role holds no
                //    scope grant, so it is the principal that can prove the ACL
                //    narrows a caller that holds no grant — the admin carries the
                //    wildcard allow-all rule the access realm seeds (`access.any`).
                async function viewerLogin(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testViewer', password: 'testPassword'},
                        $meta,
                    );
                    const viewerId = decodeJwtClaim(result.access_token, 'sub');
                    assert.ok(viewerId, 'viewer actor id decoded from the access token');
                    return {viewerId};
                },

                // 2. Resolve the target keys.  A call without `$meta.auth` is a
                //    system call: the record gate is bypassed (seeds and internal
                //    dispatches must be able to read every record).
                async function systemKeys(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const system = {...$meta, auth: undefined};
                    const persons = rowsOf(
                        await partyPersonFind<unknown>(
                            {paging: {pageNumber: 1, pageSize: 100}},
                            {...system, method: 'party.person.find'},
                        ),
                    );
                    const units = rowsOf(
                        await partyUnitFind<unknown>(
                            {paging: {pageNumber: 1, pageSize: 100}},
                            {...system, method: 'party.unit.find'},
                        ),
                    );
                    const person = (lastName: string): string => {
                        const found = persons.find(row => row.lastName === lastName);
                        assert.ok(found, `person ${lastName} is seeded`);
                        return found!.personId as string;
                    };
                    const unit = (unitName: string): string => {
                        const found = units.find(row => row.unitName === unitName);
                        assert.ok(found, `unit ${unitName} is seeded`);
                        return found!.unitId as string;
                    };
                    const organizations = rowsOf(
                        await partyOrganizationFind<unknown>(
                            {paging: {pageNumber: 1, pageSize: 100}},
                            {...system, method: 'party.organization.find'},
                        ),
                    );
                    const organization = (legalName: string): string => {
                        const found = organizations.find(row => row.legalName === legalName);
                        assert.ok(found, `organization ${legalName} is seeded`);
                        return found!.organizationId as string;
                    };
                    return {
                        john: person('Doe'),
                        jane: person('Smith'),
                        alice: person('Brown'),
                        retail: unit('Retail Branch'),
                        finServe: unit('FinServe Branch'),
                        globalBank: organization('Global Bank Corp'),
                        finServeOrg: organization('FinServe Solutions Ltd'),
                    };
                },

                // 3. Implicit allow: the Admin role's grant on Head Office covers
                //    the records of its child units through `isPartOf`.
                async function listScoped(
                    assert: IAssert,
                    {
                        $meta,
                        login,
                        systemKeys,
                    }: {$meta: IMeta; login: Promise<{actorId: string}>; systemKeys: Promise<Keys>},
                ) {
                    const {actorId} = await login;
                    const user = {...$meta, auth: {actorId}, method: 'party.person.find'};
                    // The test database is shared with the browser suite, which
                    // can leave a second person with the same last name behind —
                    // the inherited scope must show *at least* the seeded one.
                    const doe = rowsOf(
                        await partyPersonFind<unknown>(
                            {filterBy: {lastName: 'Doe'}, paging: {pageNumber: 1, pageSize: 10}},
                            user,
                        ),
                    );
                    assert.ok(doe.length >= 1, 'Doe is visible through the inherited scope');
                    const garcia = rowsOf(
                        await partyPersonFind<unknown>(
                            {filterBy: {lastName: 'Garcia'}, paging: {pageNumber: 1, pageSize: 10}},
                            user,
                        ),
                    );
                    assert.equal(garcia.length, 1, 'Garcia is visible through the inherited scope');
                    await systemKeys;
                    return {actorId};
                },

                // 4. The list omits what the caller may not act on: an explicitly
                //    denied record for the admin, and every scoped record for a
                //    principal that holds no grant at all (the admin's wildcard
                //    allow covers the rest, so it cannot show "out of scope").
                async function listDenied(
                    assert: IAssert,
                    {
                        $meta,
                        listScoped,
                        viewerLogin,
                    }: {
                        $meta: IMeta;
                        listScoped: Promise<{actorId: string}>;
                        viewerLogin: Promise<{viewerId: string}>;
                    },
                ) {
                    const {actorId} = await listScoped;
                    const {viewerId} = await viewerLogin;
                    const denied = rowsOf(
                        await partyPersonFind<unknown>(
                            {filterBy: {lastName: 'Smith'}, paging: {pageNumber: 1, pageSize: 10}},
                            {...$meta, auth: {actorId}, method: 'party.person.find'},
                        ),
                    );
                    assert.equal(
                        denied.length,
                        0,
                        'an explicitly denied record is filtered out of the list',
                    );
                    for (const [lastName, why] of [
                        ['Brown', 'a record outside the caller scopes is filtered out'],
                        ['Doe', 'a caller with no grant is shown no scoped record at all'],
                    ] as const) {
                        const rows = rowsOf(
                            await partyPersonFind<unknown>(
                                {filterBy: {lastName}, paging: {pageNumber: 1, pageSize: 10}},
                                {...$meta, auth: {actorId: viewerId}, method: 'party.person.find'},
                            ),
                        );
                        assert.equal(rows.length, 0, why);
                    }
                    return {actorId};
                },

                // 5. Single-record read of an allowed record.
                async function getAllowed(
                    assert: IAssert,
                    {
                        $meta,
                        listScoped,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        listScoped: Promise<{actorId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId} = await listScoped;
                    const {john} = await systemKeys;
                    const result = await partyPersonGet<{person: {lastName: string}}>(
                        {personId: john},
                        {...$meta, auth: {actorId}, method: 'party.person.get'},
                    );
                    assert.equal(result.person.lastName, 'Doe', 'an in-scope record is readable');
                    return {actorId};
                },

                // 6. Explicit deny beats the implicit allow, and a read reports
                //    not-found so the caller cannot probe for the record.
                async function getDenied(
                    assert: IAssert,
                    {
                        $meta,
                        listScoped,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        listScoped: Promise<{actorId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId} = await listScoped;
                    const {jane} = await systemKeys;
                    let failure = '';
                    try {
                        await partyPersonGet(
                            {personId: jane},
                            {
                                ...$meta,
                                auth: {actorId},
                                method: 'party.person.get',
                                expect: ['acl.notFound'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'acl.notFound', 'a denied record reads as not-found');
                    return {actorId};
                },

                // 7. Out-of-scope single record read, as the principal with no grant.
                async function getOutOfScope(
                    assert: IAssert,
                    {
                        $meta,
                        viewerLogin,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        viewerLogin: Promise<{viewerId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {viewerId} = await viewerLogin;
                    const {alice} = await systemKeys;
                    let failure = '';
                    try {
                        await partyPersonGet(
                            {personId: alice},
                            {
                                ...$meta,
                                auth: {actorId: viewerId},
                                method: 'party.person.get',
                                expect: ['acl.notFound'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(
                        failure,
                        'acl.notFound',
                        'an out-of-scope record reads as not-found',
                    );
                    return {viewerId};
                },

                // 8. Writes are refused with 403 (the caller knows the record).
                async function editDenied(
                    assert: IAssert,
                    {
                        $meta,
                        listScoped,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        listScoped: Promise<{actorId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId} = await listScoped;
                    const {jane} = await systemKeys;
                    let failure = '';
                    try {
                        await partyPersonEdit(
                            {person: {personId: jane, occupation: 'should not be written'}},
                            {
                                ...$meta,
                                auth: {actorId},
                                method: 'party.person.edit',
                                expect: ['acl.denied'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'acl.denied', 'editing a denied record is refused');
                    return {actorId};
                },

                // 9. `add` is checked against the scope it is created in.
                async function addOutOfScope(
                    assert: IAssert,
                    {
                        $meta,
                        viewerLogin,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        viewerLogin: Promise<{viewerId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {viewerId} = await viewerLogin;
                    const {finServe} = await systemKeys;
                    let failure = '';
                    try {
                        await partyPersonAdd(
                            {
                                person: {
                                    personId: 'uuid',
                                    firstName: 'Outside',
                                    lastName: 'Scope',
                                },
                                unit: [{unitId: finServe}],
                            },
                            {
                                ...$meta,
                                auth: {actorId: viewerId},
                                method: 'party.person.add',
                                expect: ['acl.scopeDenied'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(
                        failure,
                        'acl.scopeDenied',
                        'creating outside the scope is refused',
                    );
                    return {viewerId};
                },

                // 10. …and succeeds inside the scope; the created row is then
                //     visible to the same caller and cleanly removed again.
                async function addInScope(
                    assert: IAssert,
                    {
                        $meta,
                        listScoped,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        listScoped: Promise<{actorId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId} = await listScoped;
                    const {retail} = await systemKeys;
                    const user = {...$meta, auth: {actorId}};
                    const added = await partyPersonAdd<{person: {personId: string}}>(
                        {
                            person: {
                                personId: 'uuid',
                                firstName: 'Scoped',
                                lastName: 'Person',
                            },
                            unit: [{unitId: retail}],
                        },
                        {...user, method: 'party.person.add'},
                    );
                    const personId = added.person.personId;
                    assert.ok(
                        typeof personId === 'string' && personId.length > 0,
                        'the record is created inside the scope',
                    );
                    const rows = rowsOf(
                        await partyPersonFind<unknown>(
                            {filterBy: {lastName: 'Person'}, paging: {pageNumber: 1, pageSize: 10}},
                            {...user, method: 'party.person.find'},
                        ),
                    );
                    assert.equal(rows.length, 1, 'the created record is visible to its creator');
                    await partyPersonRemove<unknown>(
                        {personId},
                        {...user, method: 'party.person.remove'},
                    );
                    return {actorId};
                },

                // 11. `access.session.verify` re-validates the action against the
                //     live permission paths and requires the record for a guarded
                //     entity (a forgetful caller must fail, not pass silently).
                async function verifyRequiresRecord(
                    assert: IAssert,
                    {
                        $meta,
                        login,
                    }: {$meta: IMeta; login: Promise<{actorId: string; sessionId: string}>},
                ) {
                    const {actorId, sessionId} = await login;
                    let failure = '';
                    try {
                        await accessSessionVerify(
                            {action: 'party.person.get', sessionId},
                            {
                                ...$meta,
                                auth: {actorId},
                                method: 'access.session.verify',
                                expect: ['acl.notPermitted'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'acl.notPermitted', 'a guarded read needs its record');
                    return {actorId, sessionId};
                },

                // 12. With the record the same call succeeds and reports the
                //     record verdict; a denied record is refused.
                async function verifyRecords(
                    assert: IAssert,
                    {
                        $meta,
                        verifyRequiresRecord,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        verifyRequiresRecord: Promise<{actorId: string; sessionId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId, sessionId} = await verifyRequiresRecord;
                    const {john, jane} = await systemKeys;
                    const meta = {...$meta, auth: {actorId}, method: 'access.session.verify'};
                    const allowed = await accessSessionVerify<{
                        acl?: {guarded: boolean; allowed: boolean; predicate?: string};
                    }>(
                        {
                            action: 'party.person.get',
                            sessionId,
                            record: {entity: 'party.person', recordId: john},
                        },
                        meta,
                    );
                    assert.equal(allowed.acl?.guarded, true, 'the entity is ACL-guarded');
                    assert.equal(allowed.acl?.allowed, true, 'the in-scope record is allowed');
                    assert.equal(allowed.acl?.predicate, 'get', 'the predicate is reported');

                    let failure = '';
                    try {
                        await accessSessionVerify(
                            {
                                action: 'party.person.get',
                                sessionId,
                                record: {entity: 'party.person', recordId: jane},
                            },
                            {...meta, expect: ['acl.denied']},
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'acl.denied', 'verify refuses a denied record');
                    return {actorId};
                },

                // 13. The ACL matrix on the role's **Record Access** tab is the
                //     admin editor for scope-level rules: a `deny` cell for
                //     (Retail Branch, partyPerson, edit) is written to
                //     `access_acl`, reported back by `access.role.get` and
                //     enforced on the next write.
                async function matrixDeny(
                    assert: IAssert,
                    {
                        $meta,
                        verifyRecords,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        verifyRecords: Promise<{actorId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId} = await verifyRecords;
                    const {john, retail} = await systemKeys;
                    // `$meta.auth.actorId` is the crockford-encoded `sub` claim;
                    // the handlers take the base64 wire form of the binary id.
                    const userId = Buffer.from(crockfordDecode(actorId)).toString('base64');
                    const profile = await accessUserGet<{
                        role: Array<{roleId: string; roleName: string}>;
                    }>({userId}, {...$meta, auth: {actorId}, method: 'access.user.get'});
                    const admin = profile.role.find(row => row.roleName === 'Admin');
                    assert.ok(admin, 'the Admin role is granted to the caller');

                    await accessRoleEdit(
                        {
                            role: {roleId: admin!.roleId},
                            matrix: [{targetId: retail, entityName: 'partyPerson', edit: 'deny'}],
                        },
                        {...$meta, auth: {actorId}, method: 'access.role.edit'},
                    );

                    const read = await accessRoleGet<{
                        matrix: Array<Record<string, unknown>>;
                    }>(
                        {roleId: admin!.roleId},
                        {...$meta, auth: {actorId}, method: 'access.role.get'},
                    );
                    const row = read.matrix.find(item => item.entityName === 'partyPerson');
                    assert.ok(row, 'the matrix reports a partyPerson row');
                    assert.equal(row!.edit, 'deny', 'the deny cell round-trips through the matrix');

                    let failure = '';
                    try {
                        await partyPersonEdit(
                            {person: {personId: john, lastName: 'Doe'}},
                            {
                                ...$meta,
                                auth: {actorId},
                                method: 'party.person.edit',
                                expect: ['acl.denied'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failure, 'acl.denied', 'the matrix rule denies the write');
                    return {actorId, roleId: admin!.roleId, john, retail};
                },

                // 14. Emptying the cell releases the rule — the same editor both
                //     narrows an implicit grant and gives it back.
                async function matrixRelease(
                    assert: IAssert,
                    {
                        $meta,
                        matrixDeny,
                    }: {
                        $meta: IMeta;
                        matrixDeny: Promise<{
                            actorId: string;
                            roleId: string;
                            john: string;
                            retail: string;
                        }>;
                    },
                ) {
                    const {actorId, roleId, john, retail} = await matrixDeny;
                    await accessRoleEdit(
                        {
                            role: {roleId},
                            matrix: [{targetId: retail, entityName: 'partyPerson', edit: ''}],
                        },
                        {...$meta, auth: {actorId}, method: 'access.role.edit'},
                    );
                    const read = await accessRoleGet<{matrix: Array<Record<string, unknown>>}>(
                        {roleId},
                        {...$meta, auth: {actorId}, method: 'access.role.get'},
                    );
                    assert.equal(
                        read.matrix.length,
                        0,
                        'the released rule is gone from the matrix',
                    );
                    await partyPersonEdit(
                        {person: {personId: john, lastName: 'Doe'}},
                        {...$meta, auth: {actorId}, method: 'party.person.edit'},
                    );
                    return {actorId};
                },

                // 15. An organization is its own scope: the hierarchy runs the
                //     other way (`unit --belongsTo--> organization`), so a record
                //     is reachable through a grant that names it.  The admin's
                //     wildcard allow covers every record, so the guard is proved by
                //     the deny this step writes over it (deny always wins).
                async function orgScoped(
                    assert: IAssert,
                    {
                        $meta,
                        matrixRelease,
                        systemKeys,
                    }: {
                        $meta: IMeta;
                        matrixRelease: Promise<{actorId: string}>;
                        systemKeys: Promise<Keys>;
                    },
                ) {
                    const {actorId} = await matrixRelease;
                    const {globalBank, finServeOrg} = await systemKeys;
                    // `access.user.get` hands back the roles of the caller, so the
                    // deny can be attached to the `Admin` role itself.
                    const userId = Buffer.from(crockfordDecode(actorId)).toString('base64');
                    const profile = await accessUserGet<{
                        role: Array<{roleId: string; roleName: string}>;
                    }>({userId}, {...$meta, auth: {actorId}, method: 'access.user.get'});
                    const admin = profile.role.find(row => row.roleName === 'Admin');
                    assert.ok(admin, 'the Admin role is granted to the caller');
                    const actions = await accessDropdownList<{
                        'access.action': Array<{value: string; label: string}>;
                    }>({}, {...$meta, auth: {actorId}, method: 'access.dropdown.list'});
                    for (const actionName of [
                        'party.organization.find',
                        'party.organization.get',
                    ]) {
                        const action = actions['access.action'].find(
                            row => row.label === actionName,
                        );
                        assert.ok(action, `the ${actionName} action resource exists`);
                        try {
                            await accessAclAdd(
                                {
                                    acl: {
                                        principalId: admin!.roleId,
                                        actionId: action!.value,
                                        targetId: finServeOrg,
                                        targetKind: 'scope',
                                        effect: 'deny',
                                        isActive: true,
                                    },
                                },
                                {...$meta, auth: {actorId}, method: 'access.acl.add'},
                            );
                        } catch {
                            // Already written by a previous run of this flow.
                        }
                    }
                    const visible = rowsOf(
                        await partyOrganizationFind<unknown>(
                            {paging: {pageNumber: 1, pageSize: 100}},
                            {...$meta, auth: {actorId}, method: 'party.organization.find'},
                        ),
                    );
                    assert.ok(
                        visible.some(row => row.organizationId === globalBank),
                        'the organization the admin is scoped to is listed',
                    );
                    assert.ok(
                        !visible.some(row => row.organizationId === finServeOrg),
                        'an organization denied for the admin is filtered out',
                    );
                    return {actorId, finServeOrg};
                },

                // 16. The same organization is unreadable by key, and the refusal
                //     reports not-found so its existence does not leak.
                async function orgOutOfScope(
                    assert: IAssert,
                    {
                        $meta,
                        orgScoped,
                    }: {
                        $meta: IMeta;
                        orgScoped: Promise<{actorId: string; finServeOrg: string}>;
                    },
                ) {
                    const {actorId, finServeOrg} = await orgScoped;
                    let failure = '';
                    try {
                        await partyOrganizationGet(
                            {organizationId: finServeOrg},
                            {
                                ...$meta,
                                auth: {actorId},
                                method: 'party.organization.get',
                                expect: ['acl.notFound'],
                            },
                        );
                    } catch (error) {
                        failure = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(
                        failure,
                        'acl.notFound',
                        'an out-of-scope organization reads as not-found',
                    );
                    return {actorId};
                },
            ]),
    }),
);
