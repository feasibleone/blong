import {handler} from '@feasibleone/blong';
import crypto from 'node:crypto';
import http from 'node:http';

/**
 * Lightweight Google OIDC mock server (sim layer — integration intent only).
 *
 * Serves the OIDC endpoints the client adapter calls plus the browser
 * redirect target:
 *   - GET  /.well-known/openid-configuration → OIDC discovery document
 *   - GET  /authorize → 302 to `redirect_uri?code=...&state=...` (no consent page)
 *   - POST /token     → `{access_token, id_token, token_type, expires_in}`
 *                       (id_token is an RS256 JWT signed with the mock key)
 *   - GET  /certs     → the matching public JWKS
 *   - GET  /userinfo  → the standard OIDC claims (requires `Authorization: Bearer`)
 *
 * The mock is started as a guarded module-level side effect so it is up as soon
 * as the `sim` layer is imported (integration intent only).  It listens on
 * port 9082 by default (override with GOOGLE_MOCK_PORT).
 */

const _port = Number(process.env.GOOGLE_MOCK_PORT ?? 9082);
// Unique per process run so repeated test runs auto-register a fresh account
// (override with GOOGLE_MOCK_SUB / GOOGLE_MOCK_EMAIL for deterministic tests).
const _runSuffix = process.env.GOOGLE_MOCK_SUFFIX ?? Date.now().toString(36);
const _testSub = process.env.GOOGLE_MOCK_SUB ?? `mock-google-sub-${_runSuffix}`;
const _testEmail = process.env.GOOGLE_MOCK_EMAIL ?? `guest.google.${_runSuffix}@gmail.com`;
const _testGivenName = process.env.GOOGLE_MOCK_GIVEN_NAME ?? 'Gmail';
const _testFamilyName = process.env.GOOGLE_MOCK_FAMILY_NAME ?? 'Guest';
const _kid = 'mock-google-key';

const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
});
const _mockPublicJwk = publicKey.export({format: 'jwk'}) as Record<string, string>;

function b64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
}

/** Standard OIDC claims for the mock test account (shared by id_token + userinfo). */
function buildClaims(): Record<string, string | boolean> {
    return {
        sub: _testSub,
        email: _testEmail,
        email_verified: true,
        name: `${_testGivenName} ${_testFamilyName}`,
        given_name: _testGivenName,
        family_name: _testFamilyName,
        picture: `http://localhost:${_port}/avatar/${_testSub}`,
    };
}

/** Build a signed RS256 id_token for the mock test account. */
function buildIdToken({audience}: {audience: string}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({alg: 'RS256', kid: _kid, typ: 'JWT'}));
    const payload = b64url(
        JSON.stringify({
            iss: 'mock-google',
            aud: audience,
            ...buildClaims(),
            iat: now,
            exp: now + 3600,
        }),
    );
    const signature = b64url(
        crypto.sign('sha256', Buffer.from(`${header}.${payload}`), privateKey),
    );
    return `${header}.${payload}.${signature}`;
}

/** Read and URL-decode the request body (form-encoded). */
async function readBody(req: http.IncomingMessage): Promise<Record<string, string>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    const params: Record<string, string> = {};
    for (const pair of raw.split('&')) {
        const [key, ...rest] = pair.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=') ?? '');
    }
    return params;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
}

function startMockGoogleServer(port: number): void {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        try {
            if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
                return sendJson(res, 200, {
                    issuer: `http://localhost:${_port}`,
                    authorization_endpoint: `http://localhost:${_port}/authorize`,
                    token_endpoint: `http://localhost:${_port}/token`,
                    userinfo_endpoint: `http://localhost:${_port}/userinfo`,
                    jwks_uri: `http://localhost:${_port}/certs`,
                    response_types_supported: ['code'],
                    subject_types_supported: ['public'],
                    id_token_signing_alg_values_supported: ['RS256'],
                    scopes_supported: ['openid', 'email', 'profile'],
                });
            }

            if (req.method === 'GET' && url.pathname === '/authorize') {
                const redirectUri = url.searchParams.get('redirect_uri');
                const state = url.searchParams.get('state') ?? '';
                if (!redirectUri) return sendJson(res, 400, {error: 'invalid_request'});
                const location = `${redirectUri}?code=mock-google-code&state=${encodeURIComponent(state)}`;
                res.writeHead(302, {Location: location});
                return res.end();
            }

            if (req.method === 'POST' && url.pathname === '/token') {
                const form = await readBody(req);
                const clientId = form.client_id ?? '';
                const idToken = buildIdToken({audience: clientId});
                return sendJson(res, 200, {
                    access_token: 'mock-access-token',
                    id_token: idToken,
                    token_type: 'Bearer',
                    expires_in: 3600,
                });
            }

            if (req.method === 'GET' && url.pathname === '/certs') {
                return sendJson(res, 200, {
                    keys: [
                        {
                            ..._mockPublicJwk,
                            kid: _kid,
                            alg: 'RS256',
                            use: 'sig',
                        },
                    ],
                });
            }

            if (req.method === 'GET' && url.pathname === '/userinfo') {
                const authorization = req.headers.authorization ?? '';
                if (!authorization.startsWith('Bearer ')) {
                    return sendJson(res, 401, {error: 'invalid_token'});
                }
                return sendJson(res, 200, buildClaims());
            }

            return sendJson(res, 404, {error: 'not_found'});
        } catch (error) {
            return sendJson(res, 500, {error: 'internal_error', message: String(error)});
        }
    });

    server.on('error', error => {
        // eslint-disable-next-line no-console
        console.error('[mock-google] server error:', error);
    });
    server.listen(port, '0.0.0.0');
    // Do not keep the process/event loop alive just for the mock — tests must
    // be able to exit (tap waits for all open handles).
    server.unref();
    // eslint-disable-next-line no-console
    console.log(`[mock-google] listening on http://localhost:${port}`);
}

if (!(globalThis as Record<string, unknown>).__mockGoogleStarted) {
    (globalThis as Record<string, unknown>).__mockGoogleStarted = true;
    startMockGoogleServer(_port);
}

export default handler(
    () =>
        async function mockGoogleStatus(): Promise<{success: boolean; port: number}> {
            return {success: true, port: _port};
        },
);
