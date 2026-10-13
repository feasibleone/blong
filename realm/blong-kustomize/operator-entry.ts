import {server} from '@feasibleone/blong';
import {SUITE_MOUNT} from './generator.ts';
import {OPERATOR_NAME, OPERATOR_NAMESPACE} from './operator.ts';

/**
 * operator.ts — the entry point of the operator itself.
 *
 * One operator per cluster (@@D-396), loading this realm and nothing else: the suites it reconciles are
 * not its own code, and it reaches each of them by loading *their* artifact in a short-lived child
 * (@@D-395). This file exists so that "the operator" is something a generation can be pointed at: the
 * realm writes its own install tree from here — namespace, cache, the artifact the operator runs
 * from, its Deployment, its cluster-scoped rights and the CRD.
 *
 * `entry` names the operator's own module inside the artifact, which is why it is spelled with the
 * mount rather than as a relative path: the framework imports the argument as given, so a relative
 * one would resolve against the framework's own directory (@@F-360).
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
         * (@@F-489). Attached first, because a realm that provides something has to be there before the one
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
            // The cluster adapter is this process's own, so a call to it must resolve *in* this
            // process — a deployed process is the case the framework cannot see for itself — and it is
            // left `true`, which also lets the two writing legs resolve locally.
            remote: {
                canSkipSocket: true,
                // The one method that must not leave through a gateway: the realm answers `identity`
                // itself, from inside the verification of the caller's token (@@F-494 @@F-497).
                skipGateway: '^identity\\.',
                blongLogin: false,
                openId: {
                    // The issuer of this process's own sessions, served by this gateway's own session
                    // handlers — loopback, because verifier and server are one process (@@F-500).
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
                        // `Decryption failed`, three steps away from the missing keys (@@F-494).
                        session: true,
                    },
                },
            },
            // `blongLogin: false` (this process authenticates rather than identifies, and the issuer
            // it checks is the cluster's own) and the `gateway` port it must name (@@F-494).
            gateway: {port: 8080},
            srv: {orchestrator: true, adapter: false},
            kustomize: {
                deploy: {
                    install: true,
                    // The nodes a `nodeLocal` deployment runs on, for the passes this process plans
                    // itself. It cannot ask its own registry the way a `k8s` run does — it does not
                    // carry the suite it reconciles — so the answer is configuration, and a selector
                    // every node carries is the honest way to say "the cluster this is installed in"
                    // . A tenant narrows it, or names the nodes outright, in its CR, which
                    // spells the same thing `nodeSource` — the config holds the source, the spec file
                    // the tree writer reads holds the resolved names, and one field cannot be both.
                    nodes: {selector: 'kubernetes.io/hostname'},
                    // The deployment page's address (@@D-523). The operator is the only thing that ever
                    // serves it — a suite's portal cannot front the operator's Service, because an
                    // Ingress backend has to live in the Ingress's own namespace — so the host is the
                    // installer's to name, beside `install` itself and never in a tenant's CR.
                    operator: {ingress: {host: 'blong-operator.test'}},
                    suite: {
                        name: OPERATOR_NAME,
                        namespace: OPERATOR_NAMESPACE,
                        // The artifact holds this file under its repository path, and the entry carries
                        // that prefix (@@F-513). Absolute for the reason {@link SUITE_MOUNT} gives.
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
                    // realm it runs, with nothing in the tree saying why (@@F-396). The suite configs
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
                // The session this process mints at login, addressed under `login` because that is the
                // port whose handlers mint it; one issuer named here and in `remote.openId`
                // (@@F-494 @@F-500).
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
        // tree point a single Ingress at it (@@D-523's install-level host, confirmed). The path is the
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
