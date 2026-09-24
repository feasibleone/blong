import {server} from '@feasibleone/blong';

export default server(() => ({
    url: import.meta.url,
    children: [
        /** Built-in blong-server realm: RPC, auth, portal, auth orchestrators */
        async function srv() {
            return import('@feasibleone/blong-server/server.ts');
        },
        async function login() {
            return import('@feasibleone/blong-login/server.ts');
        },
        /** Core utility realm: shared resource/type/triple/path schema objects */
        async function core() {
            return import('@feasibleone/blong-core/server.ts');
        },
        /** RBAC access control realm — credentials + roles/capabilities/actions */
        async function access() {
            return import('@feasibleone/blong-access/server.ts');
        },
        /** API Gateway realm — applications, bundles, subscriptions, metering */
        async function gateway() {
            return import('./server.ts');
        },
    ],
    config: {
        default: {
            gateway: {authorize: 'access.authorization.list'},
            apiGateway: {
                enabled: true,
                meterHandler: 'gateway.meter.check',
            },
        },
        dev: {
            srv: {},
            core: {},
            login: {},
            access: {},
            gateway: {},
            // Progress points and branch rationales are instrumentation: a development run records
            // them and emits them with the records they ride, while production leaves
            // `$meta.checkpoint` unattached so its `?.` call costs nothing (`core/blong-gogo/src/checkpoint.ts`).
            // This suite is the one that demonstrates them — `test/observedMergeFlow.play.ts` draws
            // the merge's notes and the alternative it did not take — so it is where the mode is on.
            registry: {checkpointMode: 'debug'},
        },
        integration: {
            watch: {
                test: ['test.meter.flow'],
            },
        },
    },
}));
