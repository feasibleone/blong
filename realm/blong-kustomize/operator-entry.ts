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
            remote: {canSkipSocket: true},
            // The deployment read API is served *by this process*, so it declares the HTTP surface a
            // deployment has: the framework constructs its gateway component from a `gateway` config,
            // and with nothing named there the operator ran only its rpc server — which answers the
            // internal `<namespace>.request` dispatch and no per-method route at all, so the path the
            // docs promise (`/rpc/kustomize/deployment/find`) had no listener in the cluster (T-261).
            gateway: {port: 8080},
            // The loop is the behaviour and the gateway is the one surface this process serves: the
            // container arguments the install tree writes (`kustomize.operator.*`) switch the loop on.
            kustomize: {
                deploy: {
                    install: true,
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
                    // released like any other package, and read from the volume the tree's cache
                    // DaemonSet or seed Job fills.
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
            },
        },
    },
}));
