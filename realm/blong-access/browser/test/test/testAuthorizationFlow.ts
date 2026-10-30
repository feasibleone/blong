import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** The JSON shape the server accepts for a binary permission map (a serialised Buffer). */
type PermissionMapData = {type: 'Buffer'; data: number[]};

function decodeBase64(value: string, url = false): PermissionMapData {
    const base64 = url ? value.replaceAll('-', '+').replaceAll('_', '/') : value;
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return {type: 'Buffer', data: Array.from(binary, character => character.charCodeAt(0))};
}

function emptyPermissionMap(length: number): PermissionMapData {
    return {type: 'Buffer', data: new Array<number>(length).fill(0)};
}

/**
 * Decode a JWT's payload to extract the `per` claim (base64-encoded permissionMap).
 */
function decodePermissionMap(token: string): PermissionMapData {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(String.fromCharCode(...decodeBase64(payload, true).data)) as {
        per: string;
    };
    return decodeBase64(decoded.per);
}

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

export default handler(
    ({lib: {group}, handler: {loginTokenCreate, accessAuthorizationList, accessTestPrivate}}) => ({
        testAuthorizationFlow: ({
            name = 'authorization flow browser',
            hasSession = false,
        }: {name?: string; hasSession?: boolean} = {}) =>
            group(name)([
                // ── Pre-login tests (no MLE token stored yet) ──

                // 1. No auth: call protected endpoint without any token → 401.
                //    A host page that is already signed in exercises the
                //    authenticated path instead.
                async function httpNoAuth(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    if (hasSession) {
                        const result = await accessTestPrivate<{success: boolean}>({}, $meta);
                        assert.equal(
                            result.success,
                            true,
                            'accessTestPrivate succeeds with the host session',
                        );
                        return;
                    }
                    try {
                        // Declared: a refusal this step asserts on is not a failure the
                        // stream should name — the gateway demotes it to `debug` and the
                        // browser does not raise its dialog (@@D-685).
                        await accessTestPrivate({}, {...$meta, expect: 'gateway.jwtMissingHeader'});
                        assert.fail('accessTestPrivate should have thrown without auth');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(
                            status,
                            401,
                            'accessTestPrivate without auth token returns HTTP 401',
                        );
                    }
                },

                // ── Login-based tests (MLE token set after loginTokenCreate) ──

                // 2. Auth denied: login as testViewer (no permissions), call accessTestPrivate → 403
                async function httpAuthDeny(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate(
                        {username: 'testViewer', password: 'testPassword'},
                        $meta,
                    );
                    try {
                        // The RBAC refusal is the assertion, so it is declared (@@D-685).
                        await accessTestPrivate({}, {...$meta, expect: 'gateway.notAllowed'});
                        assert.fail('accessTestPrivate should have thrown for unauthorized user');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(
                            status,
                            403,
                            'accessTestPrivate without required permission returns HTTP 403',
                        );
                    }
                },

                // 3. Auth allowed: login as testUser (has accessTestPrivate), call accessTestPrivate → 200
                async function httpAuthPass(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate({username: 'testUser', password: 'testPassword'}, $meta);
                    const result = await accessTestPrivate<{success: boolean}>({}, $meta);
                    assert.equal(
                        result.success,
                        true,
                        'accessTestPrivate succeeds with sufficient permissions',
                    );
                },

                // ── Existing permission-map tests ──

                // Log in via the backend and verify token permissions
                async function browserLogin(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        token_type: string;
                        access_token: string;
                        expires_in: number;
                        permissions: string[];
                    }>({username: 'testUser', password: 'testPassword'}, $meta);
                    assert.equal(result.token_type, 'Bearer', 'Token type is Bearer');
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'Access token is a non-empty string',
                    );
                    assert.ok(result.expires_in > 0, 'Expires in is a positive number');
                    assert.ok(
                        result.permissions.includes('accessTestPrivate'),
                        'Permissions include accessTestPrivate action',
                    );
                    return result;
                },

                // Call accessAuthorizationList via the backend with the permissionMap
                // from the JWT and verify it returns the expected actions
                async function browserAuthList(
                    assert: IAssert,
                    {
                        $meta,
                        browserLogin: loginResult,
                    }: {
                        $meta: IMeta;
                        browserLogin: Awaited<{
                            access_token: string;
                            permissions: string[];
                        }>;
                    },
                ) {
                    const token = await loginResult;
                    const permissionMap = decodePermissionMap(token.access_token);

                    const actions = await accessAuthorizationList<string[]>({permissionMap}, $meta);

                    assert.ok(Array.isArray(actions), 'Result is an array');
                    assert.ok(
                        actions.includes('accessTestPrivate'.toLowerCase()),
                        'Actions include "accessTestPrivate" (methodId format)',
                    );
                    assert.ok(actions.length >= 1, 'At least one action is returned');
                },

                // Empty permissionMap → expect empty actions
                async function browserEmptyMap(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const empty = emptyPermissionMap(1);
                    const actions = await accessAuthorizationList<string[]>(
                        {permissionMap: empty as never},
                        $meta,
                    );
                    assert.ok(Array.isArray(actions), 'Result is an array for empty map');
                    assert.equal(actions.length, 0, 'Empty permissionMap returns no actions');
                },

                // Non-matching role bits → expect empty actions
                async function browserNoMatchBits(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const buf = emptyPermissionMap(128);
                    buf.data[120] = 0x01; // set bit 960 — no role covers this
                    const actions = await accessAuthorizationList<string[]>(
                        {permissionMap: buf as never},
                        $meta,
                    );
                    assert.ok(Array.isArray(actions), 'Result is an array');
                    assert.equal(actions.length, 0, 'Non-matching bits return no actions');
                },
            ]),
    }),
);
