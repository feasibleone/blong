import {type IMeta, handler} from '@feasibleone/blong';

type CredentialCheckResult = {
    userId: string;
    permissionMap: string;
    actions: string[];
};

type ClientCredentialCheckResult = {
    applicationId: string;
    isActive: boolean;
    permissionMap: string;
    actions: string[];
};

/**
 * OAuth token endpoint (JSON-RPC `login.token.create`).
 *
 * Supports two grant types:
 * - `password` (default) — resource-owner password flow via `access.credential.check`.
 * - `client_credentials` — verifies an application's clientId/clientSecret via
 *   `access.credential.checkClient` and mints a standard JWT whose `per` carries
 *   the application's subscribed bundle roleBits.  Authorization is then uniform
 *   in the gateway jwt plugin (the same `access.authorization.list` as users).
 */
export default handler(
    ({lib: {token}, handler: {accessCredentialCheck, accessCredentialCheckClient}}) =>
        async function loginTokenCreate(
            {
                grantType = 'password',
                username,
                password,
                clientId,
                clientSecret,
            }: {
                grantType?: 'password' | 'client_credentials';
                username?: string;
                password?: string;
                clientId?: string;
                clientSecret?: string;
            },
            $meta: IMeta,
        ) {
            if (grantType === 'client_credentials') {
                const {applicationId, permissionMap, actions} = (await accessCredentialCheckClient(
                    {clientId: clientId!, clientSecret: clientSecret!},
                    // Forward $meta for tracing – the handler proxy attaches
                    // the method name and routing info automatically.
                    $meta,
                )) as ClientCredentialCheckResult;

                return token({
                    clientId: clientId!,
                    actorId: applicationId,
                    sessionId: 'session',
                    language: 'en',
                    refresh: '',
                    permissionMap,
                    mlek: $meta?.auth?.mlek,
                    mlsk: $meta?.auth?.mlsk,
                    actions,
                });
            }

            const {userId, permissionMap, actions} = (await accessCredentialCheck(
                {username: username!, password: password!},
                // Forward $meta for tracing – the handler proxy attaches
                // the method name and routing info automatically.
                $meta,
            )) as CredentialCheckResult;

            return token({
                clientId: username!,
                actorId: userId,
                sessionId: 'session',
                language: 'en',
                refresh: '',
                permissionMap,
                mlek: $meta?.auth?.mlek,
                mlsk: $meta?.auth?.mlsk,
                actions,
            });
        },
);
