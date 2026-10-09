import {orchestrator} from '@feasibleone/blong';
import {DEFAULT_OUTPUT_DIR} from '../generator.ts';
import type {IPlanConfig} from '../plan.ts';
import {stopWatch} from './controller/kustomizeWatchRun.ts';
import {startController} from './controller/operatorLoop.ts';

/**
 * orchestrator/deploy.ts — the realm's dispatch port, and nothing else.
 *
 * The port's *name* is what a config override has to address: the framework hands a port its own
 * slice of the runtime config, `mergedConfig[kustomize][deploy]`, so every key of `IPlanConfig` is
 * set as `--kustomize.deploy.<key>` (or declared under `config.<intent>.kustomize.deploy`). A key
 * addressed one level too shallow — `--kustomize.<key>` — is dropped without a warning, which is
 * what made this look like a framework bug (T-200).
 *
 * It extends `orchestrator.dispatch` so the framework attaches the local handler
 * groups (the `imports` patterns match the folder names, mirroring `srv.db`'s
 * `/\\.db$/`) and registers the `kustomize` namespace. There is no `destination`:
 * the realm reads the cluster and writes manifests, it does not route to another
 * service.
 *
 * The port serves two APIs, and which of them a process gets is the intent's decision.
 * `kustomize.tree.generate` runs only under the `k8s` intent — the activation block sets
 * `generateManifests` there and nowhere else, and `start()` checks it. The read API the UI uses
 * (`kustomize.deployment.find`) and the operator's controller handlers load in every serving intent,
 * which is why `orchestrator/layer.server.ts` exists. The operator's own loop is not in this file:
 * it is `controller/operatorLoop.ts`, beside the watch that is its other trigger, and `start()`
 * below is the only thing that starts it.
 *
 * A throw during generation rejects `platform.start()`, which propagates out of
 * `autoRun` and exits the process non-zero — the desired failure behaviour for a
 * generator.
 */
export default orchestrator<IPlanConfig>(blong => {
    /**
     * Write the tree, by asking this port for it.
     *
     * The work itself is the `kustomize.tree.generate` handler, and it is reached through the port's own
     * request path rather than done here: writing a tree needs facts only a *handler* can reach — the
     * nodes a `nodeLocal` volume is filled per come from the cluster adapter, and a port's `start()` is
     * not a handler context (its factory is given `config`, `registry` and `log`, and no handler proxy).
     * This is the same path the controller's passes take to `kustomize.reconcile.run` (T-225, D-470).
     */
    const run = async (self: {
        config?: IPlanConfig;
        log?: {info?: (entry: object) => void};
        request?: (params: unknown, meta: unknown) => Promise<unknown>;
    }): Promise<void> => {
        const outputDir = self.config?.outputDir ?? DEFAULT_OUTPUT_DIR;
        // The tree this process writes is the tree for the CR it was handed, when it was handed one:
        // the operator loads a target suite's artifact and passes its spec here, so the child plans what
        // the CR asked for rather than what this artifact's own config happens to say (T-234).
        const packet = (await self.request!(
            {outputDir, specFile: self.config?.specFile},
            {mtid: 'request', method: 'kustomize.tree.generate'},
        )) as unknown[];
        const answer = (Array.isArray(packet) ? packet[0] : packet) as {
            outputDir: string;
            files: string[];
            suite?: {name?: string; namespace?: string; install?: boolean};
            deployments?: number;
            services?: number;
            profile?: string;
            volume?: string;
        };
        self.log?.info?.({
            $meta: {mtid: 'event', method: 'kustomize.tree.generate'},
            message: answer.suite?.install
                ? `the operator's install tree: wrote ${answer.files.length} file(s) to ` +
                  `${answer.outputDir}, namespace ${answer.suite?.namespace}`
                : `${answer.suite?.name}: wrote ${answer.files.length} file(s) to ${answer.outputDir}, ` +
                  `${answer.deployments} deployment(s), ${answer.services} service(s), ` +
                  `profile ${answer.profile}, volume ${answer.volume}`,
        });
    };
    return {
        extends: 'orchestrator.dispatch',
        // The keys a command line may set: the port receives `mergedConfig.kustomize.deploy`, and an
        // undeclared key in that slice is dropped in silence, so `--kustomize.deploy.outputDir=/tmp/x`
        // needs `outputDir` named here or it never reaches the port. The rest of the plan config is
        // passed through rather than restated: this is a port declaring what may be *set*, not a
        // second definition of the plan.
        validation: blong.type.Object(
            {
                outputDir: blong.type.Optional(blong.type.String()),
                generateManifests: blong.type.Optional(blong.type.Boolean()),
            },
            {additionalProperties: true},
        ),
        activation: {
            default: {
                namespace: 'kustomize',
                // The generation API, the read API the UI uses, the GitOps seam and the
                // operator's read-only passes.
                imports: [/\.generate$/, /\.deployment$/, /\.gitops$/, /\.controller$/],
            },
            // Only the `k8s` intent asks for manifests; in a serving process the
            // port exists for the read API and must not write anything.
            k8s: {generateManifests: true},
        },
        start() {
            super.connect();
            const started = super.start();
            return Promise.resolve(started).then(async () => {
                const self = this as unknown as Parameters<typeof run>[0] & {
                    config?: IPlanConfig;
                };
                if (self.config?.generateManifests) await run(self);
                // The one place the loop is started. It reports through the port's own log and calls
                // the port's own `request`, so it takes the port as its `self` rather than anything
                // of its own (see `controller/operatorLoop.ts`).
                startController(this as unknown as Parameters<typeof startController>[0]);
            });
        },
        async stop(...params: unknown[]) {
            // The watch is a trigger this port started, so this port is what stops it. Nothing held a
            // handle on that loop, so a terminating process kept renewing its long poll while the
            // platform was shutting down and waited out its grace period. The dispatch port defines no
            // `stop()` of its own, so the base one runs last: it writes the port's own `stop` event.
            stopWatch();
            return super.stop(...params);
        },
    };
});
