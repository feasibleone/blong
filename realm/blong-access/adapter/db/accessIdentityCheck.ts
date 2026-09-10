import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import {type GoogleConfig, type GoogleFlow} from './google.ts';
import {discoverOidcConfiguration, fetchUserInfo, verifyIdToken} from './oidc.ts';

type KnexQb = any;

/**
 * Google (OAuth authorization-code flow) identity resolution.
 *
 * Exchanges the authorization code for tokens at the provider's `/token`
 * endpoint, verifies the ID token signature against the provider JWKS, then
 * resolves the local user:
 *  - by Google subject id (existing link) — logs in,
 *  - by email (existing user) — links the Google credential,
 *  - otherwise — auto-registers a new Guest account + linked person.
 *
 * The provider base URL is config-driven (the realm's `db.google` slice declared in
 * `server.ts`) so tests point at the local mock while production uses the real Google
 * endpoints.
 *
 * Returns the identity summary (userId + permissionMap + actions) needed to
 * mint a JWT, plus whether the account was just created.
 */
export default handler(
    ({
        errors,
        lib: {crockfordEncode, googleConfig},
        handler: {accessRegistrationAdd, accessPermissionList},
    }) =>
        async function accessIdentityCheck(
            params: {
                provider: string;
                code: string;
                redirectUri?: string;
                /** `oidc` (default) or `oauth` — selectable per call. */
                flow?: GoogleFlow;
            },
            $meta: IMeta,
        ): Promise<{
            userId: string;
            permissionMap: string;
            actions: string[];
            isNewUser: boolean;
        }> {
            if (params.provider !== 'google') {
                throw errors.errorAccountInvalidGoogleToken();
            }
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // Google OAuth client config: the realm's `db.google` slice (server.ts) provides the
            // reusable default (the local mock in dev), and a suite can override it via
            // `srv.db.google` — the suite override wins.
            const google = {
                ...(googleConfig<GoogleConfig>() ?? {}),
                ...((this.config as {google?: object} | undefined)?.google ?? {}),
            };
            if (!google.clientId || !google.clientSecret) {
                throw new Error('Google OAuth client is not configured');
            }
            const baseUrl = (google.baseUrl ?? 'https://accounts.google.com').replace(/\/$/, '');

            // Both flows are available simultaneously, selected per call via `params.flow`:
            //  - `oidc` (default): OIDC Discovery resolves the provider's real
            //    token/JWKS/userinfo endpoints and UserInfo enriches the profile.
            //  - `oauth`: uses the raw `${baseUrl}/token` + `${baseUrl}/certs` endpoints.
            // Either flow falls back to the hardcoded endpoints when discovery is unavailable.
            const flow = params.flow ?? 'oidc';
            let tokenEndpoint = `${baseUrl}/token`;
            let jwksUri = `${baseUrl}/certs`;
            let userinfoEndpoint: string | undefined;
            if (flow === 'oidc') {
                const oidc = await discoverOidcConfiguration(
                    google.discoveryUrl ?? `${baseUrl}/.well-known/openid-configuration`,
                );
                tokenEndpoint = oidc?.token_endpoint ?? tokenEndpoint;
                jwksUri = oidc?.jwks_uri ?? jwksUri;
                userinfoEndpoint = oidc?.userinfo_endpoint;
            }

            // 1. Exchange the authorization code for tokens (form-encoded POST)
            const tokenRes = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: params.code,
                    client_id: google.clientId,
                    client_secret: google.clientSecret,
                    redirect_uri: params.redirectUri ?? google.redirectUri ?? '',
                }),
            });
            if (!tokenRes.ok) {
                throw errors.errorAccountInvalidGoogleToken();
            }
            const tokens = (await tokenRes.json()) as {id_token?: string; access_token?: string};
            if (!tokens?.id_token) {
                throw errors.errorAccountInvalidGoogleToken();
            }

            // 2. Verify the ID token signature + audience against the provider JWKS
            const jwksRes = await fetch(jwksUri);
            if (!jwksRes.ok) {
                throw errors.errorAccountInvalidGoogleToken();
            }
            const jwks = (await jwksRes.json()) as {keys?: Array<Record<string, unknown>>};
            const claims = verifyIdToken(tokens.id_token, jwks, google.clientId);

            // 2b. Enrich with OIDC UserInfo (OIDC flow only, best-effort) — fills profile
            // fields the ID token may omit (name, given_name, family_name, picture).  The
            // verified ID-token claims stay authoritative for `sub`/`email`.
            const userInfo =
                userinfoEndpoint && tokens.access_token
                    ? await fetchUserInfo(userinfoEndpoint, tokens.access_token)
                    : undefined;
            const profile = {...claims, ...(userInfo ?? {})};

            const sub = String(claims.sub ?? '');
            const email = String(profile.email ?? claims.email ?? '').trim().toLowerCase();
            if (!sub) {
                throw errors.errorAccountInvalidGoogleToken();
            }

            // 3. Resolve the local user
            let userIdBuf: Buffer;
            let isNewUser = false;

            // 3a. Existing Google link
            const linked = await qb
                .select('userId')
                .from('access_credential')
                .where('credentialType', 'google')
                .where('credentialHash', sub)
                .first();
            if (linked) {
                userIdBuf = Buffer.from(linked.userId);
            } else {
                // 3b. Existing user by email → link the Google credential
                const existing = await qb
                    .select('core_resource.resourceId')
                    .from('core_resource')
                    .join('core_type', 'core_resource.typeId', 'core_type.typeId')
                    .where('core_type.typeAlias', 'access.user')
                    .where('core_resource.resourceName', email)
                    .first();
                if (existing) {
                    userIdBuf = Buffer.from(existing.resourceId);
                    await qb('access_credential')
                        .insert({
                            userId: userIdBuf,
                            credentialType: 'google',
                            credentialHash: sub,
                            credentialSalt: '',
                            isActive: 1,
                        })
                        .onConflict()
                        .ignore();
                } else {
                    // 3c. Auto-register a new Guest account + person
                    const registered = await accessRegistrationAdd<{userId: string}>(
                        {
                            emailAddress: email,
                            googleSubjectId: sub,
                            firstName: String(profile.given_name ?? profile.name ?? ''),
                            lastName: String(profile.family_name ?? ''),
                        },
                        $meta,
                    );
                    userIdBuf = account.uuidBuf(registered.userId);
                    isNewUser = true;
                }
            }

            const {permissionMap, actions} = await accessPermissionList<{
                roleBits: number[];
                actions: string[];
                permissionMap: string;
            }>(
                {userId: account.bufToUuid(userIdBuf)},
                $meta,
            );

            return {userId: crockfordEncode(userIdBuf), permissionMap, actions, isNewUser};
        },
);
