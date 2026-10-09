import {server} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default server(() => ({
    url: import.meta.url,
    pkg: {
        name: pkg.name,
        version: pkg.version,
    },
    children: [
        /** Built-in blong-browser realm: RPC, auth, portal, auth orchestrators */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** Marine biology demonstration realm */
        async function marine() {
            return import('@feasibleone/blong-marine/server.ts');
        },
        // The deployment realm is not listed here on purpose: it is one of the framework's own
        // realms, so the loader adds it under the intents it names for itself (`frameworkRealms` in
        // `core/blong-gogo/src/load.ts`) as soon as this suite declares
        // `@feasibleone/blong-kustomize` as a dependency. Those are `k8s` and nothing else, because a
        // suite declaring the package for its `k8s` run saying something about the processes it
        // *deploys* was the accident: a business pod carried the deployment realm's layers and ports
        // (T-254). A process that does want its read API says so with
        // `framework.realms: {kustomize: true}`. The browser side still names it, because Vite has
        // to see the specifier in the source to bundle it.
    ],
    config: {
        // The deployment settings live in `default` rather than in the `k8s` block that generates
        // the tree, because two intents have to agree on them: the generator writes the manifests
        // from them, and the operator — a serving process, which runs `release` — re-derives the
        // same plan when it reconciles a CR. A CR names what a tenant may change (the suite, the
        // volume, the services, the entry); the CRD and the operator itself are the installer's
        // decisions, and a setting that appears only under `k8s` makes an operator pass report
        // objects it does not manage as drift.
        default: {
            kustomize: {
                deploy: {
                    // No `realmRoles` here: a realm declares what it *is* in its own `server.ts`
                    // config (`k8sRealmRole`), which is both closer to the truth — `core` and `access`
                    // know they are carried *and* published, `server` knows every microservice repeats
                    // it — and immune to the two spellings of one realm (`server` the framework name,
                    // `srv` the child's), because the answer travels with the realm rather than with
                    // the name it was loaded under (D-433, T-238).
                    suite: {
                        name: 'blong-suite',
                        namespace: 'blong-suite',
                        // Read from the package beside this file rather than repeated here: the
                        // version labels every generated object and names the artifact volume, so a
                        // literal is a second place to keep in step with `package.json`, and the
                        // release that bumps the package is the release that ships the tree (Q4).
                        version: pkg.version,
                        // The framework's version, which is a different thing: it is the image tag,
                        // so the tree says `blong-gogo:1`.
                        minFrameworkVersion: '1',
                        // No tag: the generator appends the version itself, so the reference it
                        // emits is `<frameworkImage>:<version>`.
                        frameworkImage: 'docker.io/library/blong-gogo',
                        // `rush deploy` mirrors the repository's category folders, so the entry sits
                        // two levels down rather than at the artifact root the default assumes (the
                        // GitHub release zip is the flattened variant). Absolute because the runner
                        // imports the entry as given: a relative one resolves against the runner's
                        // own module, not the working directory (F-360).
                        entry: '/opt/deploy/suite/suite/blong-suite/index.ts',
                    },
                    // profile: 'monolith',
                    // The cluster's own MySQL, reached through an ExternalName Service: the suite
                    // keeps naming `db` and the cluster decides what `db` is (Phase 5).
                    externalServices: {
                        db: {
                            externalName: 'mysql.blong-integration.svc.cluster.local',
                            ports: [{name: 'mysql', port: 3306}],
                        },
                    },
                    // What a service the tree generates has to create for this suite. The list is
                    // named here because the connection that dials it lives in the `release` block
                    // below, which a `k8s` planning run does not merge: the plan reads the databases
                    // its ports' connections name, finds none, and asks the generated service for
                    // nothing — a ConfigMap that mounts and creates no database, while the migration
                    // step is the first thing to notice (T-277). One entry, because every realm in
                    // this suite dials the same database.
                    services: {
                        mysql: {databases: ['blong-integration']},
                    },
                    // A portal names its address and the process behind it, and here both are named
                    // for a reason. The host is the e2e run's: the cluster's own ingress controller
                    // answers it, and the runbook reaches the suite by sending that Host rather than
                    // by port-forwarding, which is what makes the published path an assertion instead
                    // of a manifest nobody dials. `core` is the realm whose process fronts it — the
                    // one `both` realm, so it has a process of its own *and* every other process
                    // carries it; the bundle is one build of the whole suite, so which process serves
                    // it decides the address and not the page. The alias is what names the portal and
                    // its Service (`web-http`), and it is a map rather than a list so a suite config,
                    // a CR and an overlay can each add a portal without knowing the others.
                    portal: {web: {host: 'blong-suite.test', realm: 'core'}},
                    suiteVolume: {
                        backend: 'nodeLocal',
                        artifact: {
                            source: 'url',
                            // A file server in the cluster: the prefetch DaemonSet runs `curl` inside
                            // a pod, so the artifact has to be reachable from the nodes by name. Its
                            // own namespace is not required — the suite namespace resolves the
                            // fully-qualified name.
                            url: 'http://blong-artifact.default.svc.cluster.local/suite.zip',
                        },
                    },
                    crd: true,
                },
            },
        },
        // A released suite serves its own UI out of the artifact it was deployed from (Phase 15 H): the
        // browser build is the suite package's own `vite build`, which emits `dist/` beside the entry
        // the line above names — so the path here is the artifact root, then this package, then its
        // build output — and `/s` is the prefix that build's `base` uses. Serving it from the process
        // that already answers the API is what keeps the Ingress pointed at one Service. Naming the
        // root is safe before the pipeline that fills it exists: the static plugin warns and serves
        // nothing when the directory is not there.
        release: {
            gateway: {
                static: {root: '/opt/deploy/suite/suite/blong-suite/dist'},
            },
            // No realm is named here, and that is the point: a *deployed* process loads the realms its
            // own layer flags name (`--<realm>.<layer>`, one flag per selector its plan split on) and
            // not the whole suite — the pod has to start fast and carry only what it serves (T-265).
            // What this block carries is what a release shares: the cluster's own values.
            srv: {
                db: {
                    knex: {
                        connection: {
                            // Host and port are named here rather than left to the adapter's own
                            // `release` defaults, because the merge at a connection object is not
                            // deep enough to keep them: whatever block is merged last *is* the
                            // connection, so a suite that names only the credentials hands knex a
                            // connection with no host and the process dials `127.0.0.1:3306`. The
                            // migration Job failed exactly that way on the first release-only
                            // deployment (F-414).
                            host: 'db',
                            port: 3306,
                            user: 'blong-test',
                            password: 'password',
                            database: 'blong-integration',
                        },
                    },
                },
            },
        },
        // A planning run has to see every realm the suite can deploy: the tree *is* the set of
        // processes those realms become, so a realm missing here is a realm missing from the tree.
        // Every suite names its realms once per intent that has to know them — `dev` for a
        // developer's run, `k8s` for the tree, and the flags for a deployed process.
        k8s: {core: {}, access: {}, marine: {}, login: {}},
        // A migration names the realms here for the same reason a planning run does: bringing a
        // database up to date means *every* realm the suite declares, and no intent implies a realm
        // from another. What such a run needs of each realm is the realm's own answer — `upgrade`
        // activates `error`, `adapter` and `orchestrator` in `core/blong-lib/layers.ts`, and a realm
        // that needs more says so in its own `layer.server.ts` — so the generated Job carries no
        // `--<realm>.<layer>` selector at all (T-268).
        upgrade: {core: {}, access: {}, marine: {}, login: {}},
        dev: {
            srv: {
                db: {
                    // logLevel: 'debug',
                },
            },
            core: {},
            access: {},
            marine: {},
            login: {},
        },
        // `blong <entry> k8s` needs no block of its own now: the deploy settings above are what the
        // generator reads, and the realm's own `k8s` activation block is what tells it to write. The
        // artifact is fetched by the prefetch DaemonSet, so its URL has to be one the nodes can
        // reach, and the image is built and imported into the cluster.
        // What the deployed pods run, and the settings a release shares with every other release, is
        // the `release` block above. There is deliberately no `microservice` block left: the resolver
        // and the in-process dispatch are the framework's own `release` defaults now
        // (`core/blong-gogo/src/load.ts`), the database's shape belongs to the adapter that owns it
        // (`core/blong-server/adapter/db.ts`), and what remains is the cluster's — which is what
        // `release` holds.
        //
        // No `kustomize` key there on purpose: an empty one would replace the `default` block rather
        // than add to it, and the deploy settings above are what this process reconciles from.
    },
}));
