import {type IMeta, handler} from '@feasibleone/blong';

import {rememberMleHandshake} from '../../mleHandshake.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;

/**
 * login.token.create — the deployment UI's login, answered by the cluster.
 *
 * The portal's form posts `{username, password}` and will not show a page until it gets a token
 * back. Here the **password field carries a Kubernetes service-account token**, and the credential
 * is verified by the cluster rather than by anything this realm keeps: a `TokenReview` says whose
 * token it is, and a `SubjectAccessReview` says whether that identity may reconcile this suite.
 *
 * The username is the caller's own name for itself, not the cluster's name for its credential. The
 * form pre-fills it and offers the command that mints a token, and what it names becomes the subject
 * of the session token this handler mints — so a browser's session is a fact inside its own token
 * rather than a slot in a process-wide map keyed by the service account every browser shares, which is
 * what made a second login break the first browser's calls (`ERR_JWS_SIGNATURE_VERIFICATION_FAILED`,
 * F-500). A caller that sends no username is named by the identity the cluster verified instead,
 * which is no worse than the collision it replaces.
 *
 * What comes back is a token of this realm's making, minted by `sessionTokenMint` and signed with the
 * gateway's own sign key: it carries the caller's MLE key pair (`enc`/`sig`), the session id and the
 * cluster identity that was verified (`clusterUser`). The cluster token that was *presented* is the
 * credential and is not handed back — it cannot carry those claims — so the bearer the portal stores
 * is one this deployment can verify and no other.
 *
 * What this deliberately does *not* do is authorize the read path. The gateway's methods run as the
 * process's own service account, so what protects them is the Ingress in front of the UI and the
 * RBAC of the process — the login proves the caller holds a cluster identity, and the cluster
 * decides what that identity may do about the reconcile.
 */
export default handler(({errors, handler, lib: {sessionTokenMint}}) => {
    const review = async (name: string, body: unknown, $meta: IMeta): Promise<unknown> => {
        const call = (handler as Record<string, unknown>)[name];
        if (typeof call !== 'function') {
            throw errors['kustomize.loginFailed']({
                params: {reason: 'the cluster adapter is not loaded'},
            });
        }
        return (call as ClusterCall)({body}, $meta);
    };

    return {
        async loginTokenCreate(
            params: {username?: string; password?: string} = {},
            $meta: IMeta,
        ): Promise<{
            access_token: string;
            permissions: string[];
            profile: {username?: string; clusterUser?: string};
        }> {
            const token = params.password?.trim();
            if (!token) {
                throw errors['kustomize.loginFailed']({params: {reason: 'no token was given'}});
            }

            const identity = (await review(
                'clusterToken_ReviewCreate',
                {
                    apiVersion: 'authentication.k8s.io/v1',
                    kind: 'TokenReview',
                    spec: {token},
                },
                $meta,
            )) as {
                status?: {authenticated?: boolean; error?: string; user?: {username?: string}};
            };

            const clusterUser = identity?.status?.user?.username;
            if (!identity?.status?.authenticated || !clusterUser) {
                // Say what came back rather than only that it failed: a review that was refused
                // because the process may not create reviews at all looks identical to a token the
                // cluster does not know, and the two need different fixes.
                const reason =
                    identity?.status?.error ??
                    (identity?.status
                        ? 'the cluster did not recognise it'
                        : 'the cluster did not answer with a status');
                // A refusal reaches the caller as one line, so what is not in it has to be here:
                // the length says whether the browser sent the token that was minted (a form or a
                // transport that truncates it looks exactly like an unknown token otherwise). Never
                // log the token itself — it is a credential. A caller that asked for the failure
                // (`$meta.expect`, which is how the negative test presents a token the cluster does
                // not know) is not warned about.
                if (!$meta?.expect)
                    (this as unknown as {log?: {warn?: (entry: object) => void}}).log?.warn?.({
                        $meta: {mtid: 'event', method: 'login.token.create'},
                        message: `token review refused (${reason}); presented token is ${token.length} character(s)`,
                    });
                throw errors['kustomize.loginFailed']({params: {reason}});
            }

            const verdict = (await review(
                'clusterSubject_Access_ReviewCreate',
                {
                    apiVersion: 'authorization.k8s.io/v1',
                    kind: 'SubjectAccessReview',
                    spec: {
                        user: clusterUser,
                        resourceAttributes: {
                            group: 'blong.feasible.one',
                            resource: 'blongdeployments',
                            verb: 'create',
                        },
                    },
                },
                $meta,
            )) as {status?: {allowed?: boolean}};

            // Keep the caller's MLE public keys, which rode in the header of this call because the
            // route is public: they are what every later call of this caller is verified with and
            // encrypted to. They also travel *inside* the token this login mints, which is the path
            // the browser uses; the record kept here is what answers a caller that presents the
            // cluster's token itself, and `identity.checkInternal` hands it back — see
            // `mleHandshake.ts`.
            const username = params.username?.trim() || clusterUser;
            const auth = $meta?.auth as {mlek?: object; mlsk?: object} | undefined;
            if (auth?.mlek && auth?.mlsk)
                rememberMleHandshake(username, {mlek: auth.mlek, mlsk: auth.mlsk});
            else if (!$meta?.expect)
                // Without them every call this caller makes is refused as `Decryption failed`, so the
                // absence is worth saying out loud rather than leaving to the next request.
                (this as unknown as {log?: {warn?: (entry: object) => void}}).log?.warn?.({
                    $meta: {mtid: 'event', method: 'login.token.create'},
                    message:
                        `token verified for '${username}', but the call carried no MLE handshake ` +
                        '(no mlek/mlsk in the JWE header) — later calls cannot be decrypted',
                });

            return {
                // The session this realm minted, not the cluster token that was presented: only a
                // token this deployment signs can carry the caller's keys (F-500).
                access_token: await sessionTokenMint(
                    {
                        username,
                        clusterUser,
                        ...(auth?.mlek ? {mlek: auth.mlek} : {}),
                        ...(auth?.mlsk ? {mlsk: auth.mlsk} : {}),
                    },
                    $meta,
                ),
                // Reported, not enforced: the reconcile method itself runs as the process's service
                // account, so this tells the page what the cluster would say if it asked.
                permissions: verdict?.status?.allowed ? ['kustomize.reconcile'] : [],
                profile: {username, clusterUser},
            };
        },
    };
});
