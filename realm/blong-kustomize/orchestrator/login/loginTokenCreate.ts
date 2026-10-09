import {type IMeta, handler} from '@feasibleone/blong';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;

/**
 * login.token.create — the deployment UI's login, answered by the cluster.
 *
 * The portal's form posts `{username, password}` and will not show a page until it gets a token
 * back. Here the **password field carries a Kubernetes service-account token**, and the credential
 * is verified by the cluster rather than by anything this realm keeps: a `TokenReview` says whose
 * token it is, and a `SubjectAccessReview` says whether that identity may reconcile this suite. The
 * username is ignored — the token is the credential and the review answers the name — which is why
 * the form pre-fills it and offers the command that mints one (Phase 13 A).
 *
 * The token that comes back is the same one that was presented. It is already the credential the
 * cluster trusts, so minting a second one would add a second thing to expire and a second thing to
 * get wrong; the portal stores it and sends it as the bearer.
 *
 * What this deliberately does *not* do is authorize the read path. The gateway's methods run as the
 * process's own service account, so what protects them is the Ingress in front of the UI and the
 * RBAC of the process — the login proves the caller holds a cluster identity, and the cluster
 * decides what that identity may do about the reconcile.
 */
export default handler(({errors, handler}) => {
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
            profile: {username?: string};
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

            const username = identity?.status?.user?.username;
            if (!identity?.status?.authenticated || !username) {
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
                        user: username,
                        resourceAttributes: {
                            group: 'blong.feasible.one',
                            resource: 'blongdeployments',
                            verb: 'create',
                        },
                    },
                },
                $meta,
            )) as {status?: {allowed?: boolean}};

            return {
                access_token: token,
                // Reported, not enforced: the reconcile method itself runs as the process's service
                // account, so this tells the page what the cluster would say if it asked.
                permissions: verdict?.status?.allowed ? ['kustomize.reconcile'] : [],
                profile: {username},
            };
        },
    };
});
