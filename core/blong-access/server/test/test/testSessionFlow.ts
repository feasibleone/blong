import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

type TokenResult = {
    access_token: string;
    refresh_token: string;
    session_id: string;
    expires_in: number;
    refresh_token_expires_in: number;
    permissions: string[];
};

/**
 * `access.session.verify` is the THROWING standard method — it throws an
 * `access.session.*` error (reason on `error.params.reason`) when the session
 * is not live.  Helper for asserting the expected failure reason.
 */
async function expectVerifyFailure(
    verify: unknown,
    params: object,
    $meta: IMeta,
): Promise<{failed: boolean; reason?: string; type?: string}> {
    try {
        await (verify as (params: object, $meta: IMeta) => Promise<unknown>)(params, $meta);
        return {failed: false};
    } catch (error) {
        const e = error as {params?: {reason?: string}; type?: string};
        return {failed: true, reason: e.params?.reason, type: e.type};
    }
}

/**
 * server/test/test/testSessionFlow.ts — DB-backed sessions, refresh tokens,
 * revocation, inactivity, reuse detection, cleanup and audit.
 *
 * Registered as the `test.session.flow` group (`integration.watch.test` in
 * index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            loginTokenRefresh,
            accessSessionVerify,
            accessSessionClose,
            accessSessionCleanup,
            accessAuditFind,
            accessAuditRecord,
            accessUserEdit,
        },
    }) => ({
        testSessionFlow: ({name = 'session flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Login — a session row is created and the response exposes it.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<TokenResult>(
                        {username: 'testUser', password: 'testPassword'},
                        $meta,
                    );
                    assert.ok(result.access_token, 'login returns an access token');
                    assert.ok(result.refresh_token, 'login returns a refresh token');
                    assert.ok(result.session_id, 'login returns a session id');
                    assert.ok(result.permissions.includes('accessTestPrivate'), 'has permissions');
                    return result;
                },

                // 2. The DB session is live and can be verified (standard method
                //    for critical operations).
                async function verifySession(
                    assert: IAssert,
                    {$meta, login}: {$meta: IMeta; login: Awaited<TokenResult>},
                ) {
                    const t = await login;
                    const check = await accessSessionVerify<{userId: string}>(
                        {
                            sessionId: t.session_id,
                            touch: true,
                        },
                        $meta,
                    );
                    assert.ok(check.userId, 'session verify returns the userId');
                    return t;
                },

                // 3. Refresh — new tokens, same session, rotated refresh token.
                async function refreshToken(
                    assert: IAssert,
                    {$meta, verifySession: t}: {$meta: IMeta; verifySession: Awaited<TokenResult>},
                ) {
                    const session = await t;
                    const refreshed = await loginTokenRefresh<TokenResult>(
                        {refreshToken: session.refresh_token},
                        $meta,
                    );
                    assert.ok(refreshed.access_token, 'refresh returns a new access token');
                    assert.ok(refreshed.refresh_token, 'refresh returns a new refresh token');
                    assert.notEqual(
                        refreshed.refresh_token,
                        session.refresh_token,
                        'refresh token is rotated',
                    );
                    assert.equal(
                        refreshed.session_id,
                        session.session_id,
                        'session id is preserved across refresh',
                    );
                    assert.ok(
                        refreshed.permissions.includes('accessTestPrivate'),
                        'refreshed token still carries permissions',
                    );
                    return {session, refreshed};
                },

                // 4. Reuse detection — presenting the OLD (rotated) refresh token
                //    is refused and the session is revoked as a precaution.
                async function reuseDetection(
                    assert: IAssert,
                    {
                        $meta,
                        refreshToken: r,
                    }: {
                        $meta: IMeta;
                        refreshToken: Awaited<{
                            session: TokenResult;
                            refreshed: TokenResult;
                        }>;
                    },
                ) {
                    const {session} = await r;
                    let failed = false;
                    let failureType = '';
                    try {
                        await loginTokenRefresh(
                            {refreshToken: session.refresh_token},
                            {
                                ...$meta,
                                expect: ['login.invalidRefreshToken', 'login.sessionRevoked'],
                            },
                        );
                    } catch (error) {
                        failed = true;
                        failureType = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failed, true, 'reused refresh token is refused');
                    assert.equal(
                        failureType,
                        'login.invalidRefreshToken',
                        'reuse failure type is login.invalidRefreshToken',
                    );
                    return r;
                },

                // 5. After revocation-by-reuse the (previously valid) current
                //    refresh token is also refused — session is revoked.
                async function revokedSession(
                    assert: IAssert,
                    {
                        $meta,
                        reuseDetection: r,
                    }: {
                        $meta: IMeta;
                        reuseDetection: Awaited<{
                            session: TokenResult;
                            refreshed: TokenResult;
                        }>;
                    },
                ) {
                    const {refreshed} = await r;
                    let failed = false;
                    let failureType = '';
                    try {
                        await loginTokenRefresh(
                            {refreshToken: refreshed.refresh_token},
                            {...$meta, expect: ['session.revoked', 'login.sessionRevoked']},
                        );
                    } catch (error) {
                        failed = true;
                        failureType = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failed, true, 'refresh on a revoked session is refused');
                    assert.equal(
                        failureType,
                        'login.sessionRevoked',
                        'failure type is login.sessionRevoked',
                    );
                    const {failed: verifyFailed, reason: verifyReason} = await expectVerifyFailure(
                        accessSessionVerify,
                        {sessionId: refreshed.session_id},
                        {...$meta, expect: 'session.revoked'},
                    );
                    assert.equal(verifyFailed, true, 'verify reports the session revoked');
                    assert.equal(verifyReason, 'revoked', 'reason is revoked');
                },

                // 6. Explicit close — closing a session refuses later renewal.  The
                //    session this step just created is the caller's own — mark it as
                //    such via the auth context so no `access.session.close` permission
                //    is needed.
                async function explicitClose(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const login = await loginTokenCreate<TokenResult>(
                        {username: 'testUser', password: 'testPassword'},
                        $meta,
                    );
                    await accessSessionClose(
                        {sessionId: login.session_id},
                        {...$meta, auth: {...$meta.auth, sessionId: login.session_id}},
                    );
                    const {failed: closedFailed, reason: closedReason} = await expectVerifyFailure(
                        accessSessionVerify,
                        {sessionId: login.session_id},
                        {...$meta, expect: 'session.revoked'},
                    );
                    assert.equal(closedFailed, true, 'closed session reports invalid');
                    assert.equal(closedReason, 'revoked', 'closed session reason is revoked');
                    let failed = false;
                    let failureType = '';
                    try {
                        await loginTokenRefresh(
                            {refreshToken: login.refresh_token},
                            {...$meta, expect: ['session.revoked', 'login.sessionRevoked']},
                        );
                    } catch (error) {
                        failed = true;
                        failureType = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failed, true, 'refresh on a closed session is refused');
                    assert.equal(
                        failureType,
                        'login.sessionRevoked',
                        'closed session failure type is login.sessionRevoked',
                    );

                    // Closing the CURRENT session (no explicit id) resolves to
                    // the caller's own session — no permission needed either.
                    const current = await loginTokenCreate<TokenResult>(
                        {username: 'testUser', password: 'testPassword'},
                        $meta,
                    );
                    await accessSessionClose(
                        {},
                        {...$meta, auth: {...$meta.auth, sessionId: current.session_id}},
                    );
                    const {failed: currentClosedFailed, reason: currentClosedReason} =
                        await expectVerifyFailure(
                            accessSessionVerify,
                            {sessionId: current.session_id},
                            {...$meta, expect: 'session.revoked'},
                        );
                    assert.equal(
                        currentClosedFailed,
                        true,
                        'current (no-param) session reports invalid',
                    );
                    assert.equal(
                        currentClosedReason,
                        'revoked',
                        'current (no-param) session reason is revoked',
                    );
                },

                // 7. Inactivity — a session idle past the timeout is inactive.
                async function inactivity(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const login = await loginTokenCreate<TokenResult>(
                        {username: 'testUser', password: 'testPassword'},
                        $meta,
                    );
                    // inactivityTimeout: 0 → any elapsed time exceeds the timeout.
                    const {failed, reason} = await expectVerifyFailure(
                        accessSessionVerify,
                        {sessionId: login.session_id, inactivityTimeout: 0},
                        {...$meta, expect: 'session.inactive'},
                    );
                    assert.equal(failed, true, 'idle session reports inactive');
                    assert.equal(reason, 'inactive', 'reason is inactive');
                    return login.session_id;
                },

                // 8. Cleanup — purge stale sessions (dialect-neutral).  The stale
                //    row (idle past its inactivity timeout, step 7) is expected to
                //    be removed; at minimum the handler runs and returns a count.
                async function cleanup(
                    assert: IAssert,
                    {$meta, inactivity: sessionId}: {$meta: IMeta; inactivity: string},
                ) {
                    const sid = await sessionId;
                    const result = await accessSessionCleanup<{deleted: number}>(
                        {deleteAfter: 0},
                        $meta,
                    );
                    assert.ok(
                        typeof result.deleted === 'number' && result.deleted >= 0,
                        'cleanup returns a deleted count',
                    );
                    const {failed, reason} = await expectVerifyFailure(
                        accessSessionVerify,
                        {sessionId: sid, inactivityTimeout: 0},
                        {...$meta, expect: ['session.inactive', 'session.notFound']},
                    );
                    assert.ok(
                        failed && (reason === 'inactive' || reason === 'notFound'),
                        'cleaned-up (or stale) session is no longer active',
                    );
                },

                // 9. Audit — login events are recorded (append-only), and
                //    `access.audit.record` returns the inserted record keys (the
                //    gateway access-check hook exposes the first one as
                //    `$meta.auth.auditId` for the audited handler).
                async function auditLog(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // Login in THIS run and look the row up by its session id —
                    // the audit entry carries the same dashed-UUID session id, so
                    // the find can only match this run's data.  A find by
                    // actionName alone (or unfiltered) could match stale rows from
                    // earlier local runs or other test groups and pass even when
                    // the audit write is broken.
                    const login = await loginTokenCreate<TokenResult>(
                        {username: 'testUser', password: 'testPassword'},
                        $meta,
                    );
                    const rows = (await accessAuditFind<Array<Record<string, unknown>>>(
                        {filterBy: {actionName: 'login', sessionId: login.session_id}},
                        $meta,
                    )) as Array<Record<string, unknown>>;
                    assert.ok(Array.isArray(rows), 'audit find returns rows');
                    assert.ok(
                        rows.some(
                            r =>
                                r.actionName === 'login' &&
                                (r.isSuccess === true || r.isSuccess === 1),
                        ),
                        "this run's login event is audited",
                    );
                    const recorded = await accessAuditRecord<{
                        inserted: number;
                        auditIds: string[];
                    }>(
                        {
                            audit: [
                                {actionName: 'test.audit.record', isSuccess: true, statusCode: 200},
                            ],
                        },
                        $meta,
                    );
                    assert.equal(recorded.inserted, 1, 'audit record inserts one row');
                    assert.equal(
                        recorded.auditIds.length,
                        1,
                        'audit record returns the inserted key',
                    );
                    assert.equal(
                        recorded.auditIds[0].length,
                        26,
                        'auditId is a 26-char crockford ULID',
                    );
                },

                // 10. Login-eligibility gate (role-based): a user whose role
                //     grants no `login` action is refused login (the gate is
                //     always on — unconditional).
                async function loginActionRequired(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    let failed = false;
                    let failureType = '';
                    try {
                        await loginTokenCreate(
                            {username: 'testNoLogin', password: 'testPassword'},
                            {...$meta, expect: 'login.loginNotAllowed'},
                        );
                    } catch (error) {
                        failed = true;
                        failureType = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failed, true, 'user without the login action is refused login');
                    assert.equal(
                        failureType,
                        'login.loginNotAllowed',
                        'failure type is login.loginNotAllowed',
                    );
                },

                // 11. Deactivating a user refuses renewal — the per-user disable
                //     takes effect within one access-token lifetime (renewal is
                //     the operation that extends a session).
                async function userInactiveRefusesRenewal(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const login = await loginTokenCreate<TokenResult>(
                        {username: 'testUser', password: 'testPassword'},
                        $meta,
                    );
                    // The session's userId (dashed UUID) comes from the standard
                    // throwing verify method.
                    const {userId} = await accessSessionVerify<{userId: string}>(
                        {sessionId: login.session_id},
                        $meta,
                    );
                    try {
                        await accessUserEdit<unknown>({user: {userId, isActive: false}}, $meta);
                        // The session gate itself refuses a deactivated user.
                        const {failed: verifyFailed, reason: verifyReason} =
                            await expectVerifyFailure(
                                accessSessionVerify,
                                {sessionId: login.session_id},
                                {...$meta, expect: 'session.userInactive'},
                            );
                        assert.equal(verifyFailed, true, 'verify refuses a deactivated user');
                        assert.equal(verifyReason, 'userInactive', 'reason is userInactive');
                        let failed = false;
                        let failureType = '';
                        try {
                            await loginTokenRefresh(
                                {refreshToken: login.refresh_token},
                                {...$meta, expect: ['session.userInactive', 'login.userInactive']},
                            );
                        } catch (error) {
                            failed = true;
                            failureType = (error as {type?: string}).type ?? '';
                        }
                        assert.equal(failed, true, 'refresh on a deactivated user is refused');
                        assert.equal(
                            failureType,
                            'login.userInactive',
                            'failure type is login.userInactive',
                        );
                    } finally {
                        await accessUserEdit<unknown>({user: {userId, isActive: true}}, $meta);
                    }
                },
            ]),
    }),
);
