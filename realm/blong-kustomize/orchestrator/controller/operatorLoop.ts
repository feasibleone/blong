import {OPERATOR_ENV} from '../../operator.ts';
import type {IPlanConfig} from '../../plan.ts';

/**
 * operatorLoop.ts — the operator's loop, beside the other trigger it belongs with.
 *
 * The loop is started by configuration, or by the environment the generated operator Deployment
 * sets, and absent otherwise: a UI process and the one-shot `k8s` intent must not reconcile
 * anything. It is not the port — `orchestrator/deploy.ts` is, and it starts this — and it is not a
 * scheduler either: Blong has no scheduler API (checked in `core/blong` and `core/blong-gogo`), so a
 * plain interval timer is what a resync is made of, and the one other trigger is the watch in
 * `kustomizeWatchRun.ts`.
 *
 * A pass calls the port's own `kustomize.reconcile.run` through the framework's request path, so the
 * loop is a caller like any other and its work is visible in the log as that method rather than as a
 * hidden side effect.
 *
 * The default export is the function itself only because of how a layer is loaded: `Watch.ts` reads
 * every code file in a handler-group folder and reports the ones without a default export as stray
 * source. A bare function carries neither a handler nor a library tag, so the loader classifies it as
 * neither and ignores it — which is the right reading of a module that is a helper for the port.
 */
export const startController = (self: {
    config?: IPlanConfig;
    request?: (...params: unknown[]) => Promise<unknown>;
    log?: {info?: (entry: object) => void; error?: (entry: object) => void};
}): void => {
    const configured = self.config?.controller;
    const fromEnv = process.env[OPERATOR_ENV.intervalSeconds];
    const interval = configured?.intervalSeconds ?? Number(fromEnv ?? 0);
    if (!Number.isFinite(interval) || interval <= 0 || typeof self.request !== 'function') return;

    const from =
        configured?.from ??
        (process.env[OPERATOR_ENV.from] as 'registry' | 'cr' | undefined) ??
        'cr';
    const apply = configured?.apply ?? process.env[OPERATOR_ENV.apply] === 'true';
    // Deleting is a word of its own (D-461): a deployment that wants its processes updated without
    // anything ever being removed keeps this off, and what a pass may remove is scoped to the
    // suite's namespace either way.
    const prune = configured?.prune ?? process.env[OPERATOR_ENV.prune] === 'true';

    /**
     * The loop's own call path.
     *
     * One operator serves every suite the cluster declares, so a pass names the CR it was
     * triggered by and the loop reads them all: `watch` long-polls the CRD, and each event asks for
     * the reconcile of that one object.
     *
     * A request answers `[answer, $meta]` — the answers it produced followed by the meta the loop
     * appended — and an error is thrown rather than returned. Reading the second element as the
     * result is what made a pass report the request's own meta, and it hid the watch's generator in
     * the element that looked like a failure (T-225).
     */
    const call = async (method: string, params: unknown): Promise<unknown[]> => {
        const packet = (await self.request!(params, {
            mtid: 'request',
            method,
        })) as unknown[];
        return Array.isArray(packet) ? packet.slice(0, -1) : [packet];
    };

    const pass = async (target: {name?: string; namespace?: string} = {}): Promise<void> => {
        try {
            const [result] = await call('kustomize.reconcile.run', {
                apply,
                prune,
                from,
                ...target,
            });
            self.log?.info?.({
                $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                message:
                    `controller: pass from ${from}, apply ${apply}, prune ${prune}` +
                    `${target.name ? ` on ${target.namespace ?? ''}/${target.name}` : ''}: ` +
                    `${JSON.stringify(result)}`,
            });
        } catch (error) {
            self.log?.error?.({
                $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                message: `controller: pass failed: ${String(error)}`,
            });
        }
    };

    // The watch trigger lives in the `kustomize.watch.run` handler, because a stream cannot cross
    // this loop's request path (T-227): on when the loop reads its plan from a CR, since waiting out
    // the interval for a change someone just applied is the wrong default. Off leaves the interval
    // below as the only trigger.
    const watching = from === 'cr' && configured?.watch !== false;
    self.log?.info?.({
        $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
        message:
            `controller: from ${from}, apply ${apply}, prune ${prune}, ` +
            `resync every ${interval}s, watch ${watching ? 'on' : 'off'}`,
    });
    if (watching) {
        // The trigger is a handler, not this loop, and that is the whole point of
        // `kustomize.watch.run`: a handler reaches the adapter through the local proxy, while this
        // loop's `call` crosses a transport whose reply a stream cannot survive (T-227). The handler
        // renews its watch every thirty seconds and re-lists on each renewal, so it is also the
        // resync for every CR it sees. It reconciles with the settings this loop runs under —
        // `watch: true` changes when a pass happens, never what a pass is allowed to do.
        void call('kustomize.watch.run', {apply, prune, from})
            .then(([status]) =>
                self.log?.info?.({
                    $meta: {mtid: 'event', method: 'kustomize.watch.run'},
                    message: `controller: watch ${JSON.stringify(status)}`,
                }),
            )
            // Not awaited, so the rejection is reported here: an uncaught one would end the process
            // (T-229) instead of leaving a line saying which call failed.
            .catch(error =>
                self.log?.error?.({
                    $meta: {mtid: 'event', method: 'kustomize.watch.run'},
                    message: `controller: watch failed: ${String(error)}`,
                }),
            );
    }

    // Both triggers run in every mode, and that is deliberate rather than a leftover: the watch
    // answers a change as it happens, and this timer is the safety net for the change the watch
    // could not see — one applied while the operator was down or while a renewal was failing.
    //
    // A pass from this timer is a *partial* resync where a cluster declares several CRs: with
    // `from: 'cr'` and no name, the reconcile reads the first CR in the tenant namespace and stops,
    // so the other CRs are covered by the watch and by nothing else. Naming them here would need a
    // list the loop cannot take — it has `request` and no adapter — which is why the gap is written
    // down instead of closed (see the `from: 'cr'` block in `kustomizeReconcileRun`).
    const timer = setInterval(() => {
        void pass();
    }, interval * 1000);
    // The loop must not keep the process alive on its own: a short-lived intent that happens to be
    // configured with an interval should still exit.
    timer.unref?.();
};

export default startController;
