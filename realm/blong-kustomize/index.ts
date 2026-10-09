import {server} from '@feasibleone/blong';
import {fileURLToPath} from 'node:url';

/**
 * index.ts — standalone server bootstrap for the `kustomize` realm.
 *
 * The realm is a bare-cluster installer: it deliberately does NOT load
 * `blong-server`, `blong-login`, `blong-core` or `blong-access`, and it has no
 * database or third-party dependency. Everything it needs — the loaded registry
 * it introspects and the Kubernetes API it talks to — comes from the framework
 * and its own adapters. See the realm README and `docs/blong/docs/patterns/
 * kustomize.md` for the model.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** `kustomize` deployment realm */
        async function kustomize() {
            return import('./server.ts');
        },
    ],
    config: {
        // `kustomize` is the realm slice the framework uses to decide the child loads at all; the
        // plan settings belong one level deeper, under the port's own name `deploy` — a port is
        // handed `mergedConfig[realm][port]`, so `kustomize.deploy.profile`, `kustomize.deploy.volume`
        // and `--kustomize.deploy.outputDir=/tmp/tree` are the addresses that reach `IPlanConfig`.
        default: {kustomize: {deploy: {}}},
        integration: {
            kustomize: {deploy: {}},
            // The gateway port's own slice. This realm serves no browser build, so the root is a test
            // fixture rather than a bundle, and what is under test is the leg nothing could see before
            // T-246: a block a process names under its intent reaching the port that hands it to the
            // static plugin. The plugin's behaviour is covered where the plugin is. Absolute, because
            // `@fastify/static` refuses a relative root, and derived from this file rather than written
            // out so the fixture moves with the package.
            gateway: {
                static: {root: fileURLToPath(new URL('./server/test/static', import.meta.url))},
            },
            // Every group the realm runs has to be listed here, or the watch runner never
            // executes it and the coverage report says "incomplete" for no visible reason.
            watch: {
                test: [
                    'test.plan.find',
                    'test.tree.generate',
                    'test.artifact.fetch',
                    'test.release.notify',
                    'test.cluster.auth',
                    'test.login',
                    'test.cluster.apply',
                    'test.cluster.status',
                    'test.gateway.keys',
                    'test.volume.prune',
                    'test.reconcile.guard',
                    'test.gateway.static',
                    'test.service.catalog',
                ],
            },
        },
    },
}));
