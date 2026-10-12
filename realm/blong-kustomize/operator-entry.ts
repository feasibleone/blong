import {server} from '@feasibleone/blong';
import {SUITE_MOUNT} from './generator.ts';
import {OPERATOR_NAME, OPERATOR_NAMESPACE} from './operator.ts';

/**
 * operator.ts — the entry point of the operator itself.
 *
 * One operator per cluster (D-396), loading this realm and nothing else: the suites it reconciles are
 * not its own code, and it reaches each of them by loading *their* artifact in a short-lived child
 * (D-395). This file exists so that "the operator" is something a generation can be pointed at: the
 * realm writes its own install tree from here — namespace, cache, the artifact the operator runs
 * from, its Deployment, its cluster-scoped rights and the CRD.
 *
 * `entry` names the operator's own module inside the artifact, which is why it is spelled with the
 * mount rather than as a relative path: the framework imports the argument as given, so a relative
 * one would resolve against the framework's own directory (F-360).
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /**
         * The framework's own realm, and the reason the deployment page can render at all.
         *
         * The portal asks for the model's schema before it draws anything (`subject.object.schema`), and
         * the subject orchestrator is what answers for a model, so both are served by this realm and not
         * by `kustomize`. Without it the page loaded, logged in, showed its menubar and drew an empty
         * content area, with the gateway answering 500 for a call nothing in the process could serve
         * (F-489). Attached first, because a realm that provides something has to be there before the one
         * that uses it.
         */
        // async function srv() {
        //     return import('@feasibleone/blong-server/server.ts');
        // },
        /** the `kustomize` deployment realm */
        async function kustomize() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            // The cluster adapter is this process's own, and a call to it must resolve *in* this
            // process. Without this the loop's watch leaves the pod looking for `rpc-cluster` as a
            // service name (`ResolutionK8s` maps `rpc-<namespace>` to `<namespace>.<namespace>.svc`
            // and there is no such Service) and retries `getaddrinfo ENOTFOUND rpc-cluster` forever
            // while the CR it was asked about is never reconciled. The framework sets this by itself
            // for a browser and for an `integration` run, and a deployed process is a third case it
            // cannot see: the deployment realm knows its adapter travels with it, so it says so.
            //
            // Left `true`, which the framework also accepts as a pattern of method names, and which is
            // what lets the two writing legs (the `k8s` intent and the CLI) resolve locally as well as
            // the serving one. The namespaces each leg has to resolve locally are not the same set, and
            // a narrower pattern belongs here once those sets are pinned; named too early it is a trap —
            // a call that should have stayed in the process left it instead, and the generator failed on
            // `EAI_AGAIN rpc-cluster` while the CLI died on `Unknown database`
            // (`Remote.canAnswerLocally`).
            remote: {
                canSkipSocket: true,
                // The one method that must not leave this process *through a gateway*, whichever gateway
                // a deployment configures (`GatewayCodec`'s `skipGateway`, checked where the routing
                // decision is made). The realm answers the `identity` namespace itself — the session
                // step is asked from inside the verification of the caller's token, by the very process
                // that verified it (F-494) — so a call that reached a gateway was refused for a missing
                // bearer, and one that reached the namespace dialled a Service this deployment does not
                // publish (F-497). The namespace rather than the method: everything the realm answers
                // under `identity` is this process's own handshake.
                skipGateway: '^identity\\.',
                blongLogin: false,
                openId: {
                    // The issuer of this process's *own* sessions. The realm mints a session token at
                    // login — the caller's MLE key pair has to travel with it, and a cluster token
                    // cannot carry claims — and the framework verifies what it minted against an
                    // issuer it resolves over HTTP. That issuer is this gateway: the realm serves the
                    // discovery document and the key set here, so no second Service exists to be
                    // dialled and none has to (`orchestrator/session`). Loopback, because the
                    // process that verifies and the process that serves are the same one (F-500).
                    'http://127.0.0.1:8080/rpc/session': {
                        configuration:
                            'http://127.0.0.1:8080/rpc/session/.well-known/openid-configuration',
                        audience: 'blong',
                        // A minted token carries its own session id, and it carries the keys its
                        // calls are signed with, so nothing has to be asked of an `identity`
                        // namespace for it. The cluster issuer below still asks, because a caller
                        // that presents the cluster's token itself has no other way to be read.
                        session: false,
                    },
                    'https://kubernetes.default.svc.cluster.local': {
                        configuration:
                            'https://kubernetes.default.svc.cluster.local/.well-known/openid-configuration',
                        // The API server's discovery document and key set are not anonymous: an
                        // uncredentialed read is answered with 401 (`rpc.oidcHttp`). The identity to
                        // present is the process's own, and the kubelet keeps it in the projected
                        // volume below — read per fetch, so a rotated token is picked up.
                        tokenFile: '/var/run/secrets/kubernetes.io/serviceaccount/token',
                        // The audience the cluster stamps on the tokens it issues is the issuer
                        // URL itself, so that is what verification must expect here: the framework
                        // defaults to `blong`, which belongs to tokens the framework's own login
                        // realm signs, and a cluster token presented against that default is
                        // refused as `rpc.jwtInvalid: unexpected "aud" claim value`.
                        audience: 'https://kubernetes.default.svc.cluster.local',
                        // A verified token is not yet a usable session: the caller's calls are
                        // signed with a key the gateway has to learn, and the framework learns it
                        // from the token's `enc`/`sig` claims — claims a cluster token cannot have,
                        // because the API server signs it. The session step is what closes that
                        // gap, and the framework's own answer to it is the login realm's, which
                        // this deployment does not run. The realm answers it instead, in this same
                        // process: `identity.checkInternal` hands back the handshake it recorded at
                        // login (see `mleHandshake.ts`), so the session is local and needs no
                        // service of its own. Left to the default (a session only for the framework's
                        // own issuer) every authenticated call here was refused as
                        // `Decryption failed`, three steps away from the missing keys (F-494).
                        session: true,
                    },
                },
            },
            // `blongLogin: false` is the identity half, and this process does not need it. The
            // framework's gateway verifies a bearer against a `blong-login` issuer by discovering
            // that issuer's configuration *over HTTP from the `login` service* — `oidc.ts` resolves
            // the name through `ResolutionK8s`, and a `login` Service belongs to a suite that runs
            // the framework's login realm. This deployment does not: its login is the realm's own,
            // backed by a Kubernetes `TokenReview`, so the discovery dialled a Service that was never
            // created (`login.<namespace>.svc.cluster.local`) and every authenticated call died as a
            // bare `fetch failed` (F-494). What this realm needs is authentication, not identity.
            // The deployment read API is served *by this process*, so it declares the HTTP surface a
            // deployment has: the framework constructs its gateway component from a `gateway` config,
            // and with nothing named there the operator ran only its rpc server — which answers the
            // internal `<namespace>.request` dispatch and no per-method route at all, so the path the
            // docs promise (`/rpc/kustomize/deployment/find`) had no listener in the cluster (T-261).
            // Authenticate the caller by the issuer its token already has. The portal's login
            // returns the cluster's own service-account token (verified there by a `TokenReview`),
            // so the bearer this gateway is handed is a token the *cluster* signed, and the
            // framework can check it against the cluster's own key set instead of against an
            // identity service this deployment does not run. Naming the issuer here is what makes
            // that verification possible: without it the token's issuer is one the framework has
            // never heard of, and the call is refused as `rpc.oidcBadIssuer` (F-494). The issuer
            // belongs to the codec's own config, which is the `remote` slice, not the `gateway`
            // one — the same slice that carries `canSkipSocket`.
            // The loop is the behaviour and the gateway is the one surface this process serves: the
            // container arguments the install tree writes (`kustomize.operator.*`) switch the loop on.
            //
            // The gateway is the operator's only front end — it answers the deployment read API and the
            // realm's own OIDC documents — while the calls this process makes for its own namespaces
            // resolve in-process (`remote.canSkipSocket` above), and the one method that must stay home
            // even when an outside deployment routes namespaces through a gateway is named there too
            // (`remote.skipGateway`). A caller's request and the operator's own calls are therefore
            // different paths, which is what they are: the first arrives over HTTP with headers, identity
            // and trace, the second has no other process to reach.
            gateway: {port: 8080},
            srv: {orchestrator: true, adapter: false},
            kustomize: {
                deploy: {
                    install: true,
                    // The nodes a `nodeLocal` deployment runs on, for the passes this process plans
                    // itself. It cannot ask its own registry the way a `k8s` run does — it does not
                    // carry the suite it reconciles — so the answer is configuration, and a selector
                    // every node carries is the honest way to say "the cluster this is installed in"
                    // (T-327). A tenant narrows it, or names the nodes outright, in its CR, which
                    // spells the same thing `nodeSource` — the config holds the source, the spec file
                    // the tree writer reads holds the resolved names, and one field cannot be both.
                    nodes: {selector: 'kubernetes.io/hostname'},
                    // The deployment page's address (D-434). The operator is the only thing that ever
                    // serves it — a suite's portal cannot front the operator's Service, because an
                    // Ingress backend has to live in the Ingress's own namespace — so the host is the
                    // installer's to name, beside `install` itself and never in a tenant's CR.
                    operator: {ingress: {host: 'blong-operator.test'}},
                    suite: {
                        name: OPERATOR_NAME,
                        namespace: OPERATOR_NAMESPACE,
                        // `rush deploy` mirrors the repository's category folders, so the artifact the
                        // operator runs from holds this file at `realm/blong-kustomize/operator-entry.ts`
                        // and the entry has to carry that prefix — the same rule the suite's own entry
                        // follows (`suite/blong-suite/index.ts` inside the suite's mount). Without it the
                        // install tree named `/opt/deploy/suite/operator-entry.ts`, which no artifact has,
                        // so the framework fell back to looking in its working directory and the operator
                        // exited with "No entry point found in /opt/deploy" (F-404). Absolute for the
                        // reason {@link SUITE_MOUNT} gives.
                        entry: `${SUITE_MOUNT}/realm/blong-kustomize/operator-entry.ts`,
                    },
                    // The artifact the operator process itself runs from: the deployment realm,
                    // released like any other package, and read from the volume this tree's own
                    // fill Jobs fill.
                    //
                    // A sibling of `suite` rather than a member of it, and that is not a detail: the
                    // plan's config declares the volume at this level (`IPlanConfig.suiteVolume`),
                    // so the nested spelling was dropped without a word and the generated cache
                    // container fetched `curl -fsSL ""` — an install tree that could not pull the
                    // realm it runs, with nothing in the tree saying why (F-396). The suite configs
                    // had it right; only this entry was one level deep.
                    suiteVolume: {
                        backend: 'nodeLocal',
                        artifact: {
                            source: 'url',
                            url: 'https://github.com/feasibleone/blong/releases/latest/download/blong-kustomize.zip',
                        },
                    },
                    // Its own cache and generated trees live on the claim the install tree declares.
                    artifactCacheDir: '/cache',
                    generationRoot: '/cache/generations',
                },
                // The session this process mints at login, and the issuer that makes it verifiable.
                // Addressed under `login` because that is the port whose handlers mint it: a
                // dispatch port reads `mergedConfig.kustomize.<namespace>`, so a key under `deploy`
                // is invisible to it — the mint refused with `sessionUnconfigured` while this block
                // sat there.
                //
                // One address in two places on purpose: `remote.openId` above names the issuer and
                // the discovery document to read it from, and a minted token names the same string in
                // `iss`, so verification resolves it to the key set this deployment serves on its own
                // gateway rather than an identity service it does not run (F-494, F-500). The
                // discovery document derives the key set's address from the request it answers, so
                // the issuer is the only value that has to be written twice.
                //
                // The expiry is a browser session's, not a credential's: the cluster token the
                // caller presented is still what the cluster trusts, and this one only has to
                // outlive the page it was minted for.
                login: {
                    session: {
                        issuer: 'http://127.0.0.1:8080/rpc/session',
                        audience: 'blong',
                        expiresIn: 8 * 60 * 60,
                    },
                },
            },
        },
        // The page the deployment read API belongs to, served by the process that answers it: the realm's
        // own `vite build` emits `dist/` beside this entry, and `/s` is the base that build uses, so the
        // released operator serves its UI and its API from one origin — which is what lets the install
        // tree point a single Ingress at it (D-434's install-level host, confirmed). The path is the
        // artifact root, then this package, then its build output, the way the suite names its own root.
        // Naming it is safe before the pipeline that fills it exists: the static plugin warns and serves
        // nothing when the directory is not there.
        release: {
            gateway: {
                static: {root: `${SUITE_MOUNT}/realm/blong-kustomize/dist`},
            },
        },
    },
}));
