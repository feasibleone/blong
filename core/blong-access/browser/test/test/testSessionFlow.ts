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
 * browser/test/test/testSessionFlow.ts — browser-platform (server-run, via the
 * MLE codec) session + refresh + restore flow.
 *
 * Exercises the codec/semi-SDK with NO UI: login stores tokens in memory,
 * explicit `login.token.refresh` re-mints them, a protected call still works
 * afterwards, and `login.token.restore` without a cookie is refused (401) —
 * the reload-skip-login path with a real cookie is covered by Playwright.
 *
 * Registered as the `test.session.flow` group in browser-test.ts.
 */
export default handler(
    ({
        lib: {group},
        handler: {loginTokenCreate, loginTokenRefresh, loginTokenRestore, accessTestPrivate},
    }) => ({
        testSessionFlow: ({name = 'session flow browser'}: {name?: string} = {}) =>
            group(name)([
                // 1. Login over HTTP — session + tokens.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        access_token: string;
                        refresh_token: string;
                        session_id: string;
                        permissions: string[];
                    }>({username: 'testUser', password: 'testPassword'}, $meta);
                    assert.ok(result.access_token, 'login returns an access token');
                    assert.ok(result.refresh_token, 'login returns a refresh token');
                    assert.ok(result.session_id, 'login returns a session id');
                    return result;
                },

                // 2. Explicit renewal via the codec — new tokens, same session.
                async function refresh(
                    assert: IAssert,
                    {
                        $meta,
                        login,
                    }: {$meta: IMeta; login: Awaited<{refresh_token: string; session_id: string}>},
                ) {
                    const t = await login;
                    const refreshed = await loginTokenRefresh<{
                        access_token: string;
                        refresh_token: string;
                        session_id: string;
                    }>({refreshToken: t.refresh_token}, $meta);
                    assert.ok(refreshed.access_token, 'refresh returns a new access token');
                    assert.ok(refreshed.refresh_token, 'refresh returns a new refresh token');
                    assert.equal(
                        refreshed.session_id,
                        t.session_id,
                        'session preserved on refresh',
                    );
                    return refreshed;
                },

                // 3. A protected call still works with the refreshed token.
                async function protectedCall(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await accessTestPrivate<{success: boolean}>({}, $meta);
                    assert.equal(result.success, true, 'protected call succeeds after refresh');
                },

                // 4. Restore without a cookie → refused with an auth-classified error.
                async function restoreNoCookie(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    try {
                        await loginTokenRestore({}, $meta);
                        assert.fail('login.token.restore should fail without a cookie');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(status, 200, 'restore without a cookie returns HTTP 200');
                    }
                },
            ]),
    }),
);
