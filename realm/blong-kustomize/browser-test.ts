import {browser, realm} from '@feasibleone/blong';

/**
 * browser-test.ts — Browser platform suite for `kustomize` tap tests.
 *
 * Loads the browser-side realm needed to drive the API over HTTP (blong-test's
 * backend adapter) plus a **test-only** `kustomize` browser realm that discovers
 * only the `browser/test/` layer. The React `browser/orchestrator` layer is
 * disabled via config so the tap/ts-node runner does not try to load JSX.
 *
 * The realm carries no authentication or RBAC realm: `blong-kustomize` is a
 * bare-cluster installer with no database, so the DB-backed login/access realms
 * are deliberately absent.
 */
export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object(
        {
            kustomize: blong.type.Object({}),
            testClient: blong.type.Object({
                backend: blong.type.Object({
                    namespace: blong.type.Array(blong.type.String()),
                }),
            }),
        },
        {additionalProperties: false},
    ),
    children: [
        /** blong-test: provides test dispatch + backend HTTP adapter */
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
        },
        /**
         * Test-only `kustomize` browser realm — discovers only the browser/test
         * layer (no React orchestrator components, which the tap runner cannot
         * load).
         */
        async function kustomize() {
            return realm(() => ({
                url: import.meta.url,
                children: ['./browser/test'],
                config: {
                    default: {
                        'browser/orchestrator': false,
                    },
                    integration: {
                        'browser/orchestrator': false,
                    },
                },
            }));
        },
    ],
    config: {
        default: {},
        dev: {
            kustomize: {},
        },
        integration: {
            testClient: {
                backend: {
                    // Namespaces the browser backend adapter proxies to the server
                    namespace: ['kustomize'],
                },
            },
            kustomize: {},
            // Disable the React browser layers for this tap run.
            'browser/orchestrator': false,
        },
    },
}));
