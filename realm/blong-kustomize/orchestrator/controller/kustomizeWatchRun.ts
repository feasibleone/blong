import {handler, type IMeta} from '@feasibleone/blong';
import {OPERATOR_GROUP, OPERATOR_PLURAL, OPERATOR_VERSION} from '../../operator.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;
type Log = {info?: (entry: object) => void; error?: (entry: object) => void};

/** How long one watch long-poll runs before the loop renews it — the adapter's own default. */
const WATCH_TIMEOUT_MILLIS = 30000;

/** How long to wait after a watch fails: long enough not to spin, short enough to recover. */
const WATCH_RETRY_MILLIS = 5000;

/**
 * The shortest a watch cycle may take before the loop waits out the rest.
 *
 * A stream that ends at once is a stream that is not behaving, and renewing it immediately is a busy
 * loop against the API server rather than a watcher.
 */
const WATCH_MIN_CYCLE_MILLIS = 1000;

/** A burst of events — one deploy writes several objects — becomes one pass. */
const COALESCE_MILLIS = 250;

/** What the adapter's watch answers: what already exists, and the stream of what changes. */
interface IWatchAnswer {
    events?: AsyncIterable<{
        type?: string;
        object?: {metadata?: {name?: string; namespace?: string; generation?: number}};
    }>;
    existing?: {
        items?: Array<{
            metadata?: {name?: string; namespace?: string; generation?: number};
        }>;
    };
}

/**
 * How a triggered pass behaves — the caller's settings, not the watch's own opinion.
 *
 * The watch only decides _when_ to reconcile; whether that pass writes to the cluster and where it
 * reads its plan from stay the controller's decisions, so a read-only controller stays read-only.
 */
interface IPassOptions {
    apply?: boolean;
    prune?: boolean;
    from?: 'registry' | 'cr';
}

/**
 * kustomize.watch.run — the operator's trigger.
 *
 * The watch belongs in a handler rather than in the port's loop for one reason, and it is the
 * reason this file exists: a handler reaches the adapter through the handler proxy, which is a local
 * call, while the port's `request` path crosses a transport that serialises both directions. The
 * adapter's watch answers a stream, and a stream does not survive serialisation — the reply came
 * back as `null`, which read as "no events and nothing existing" (T-227). Through the proxy the
 * stream arrives whole, so the loop can hold it and a reconcile is triggered per event.
 *
 * The loop is started, not awaited: a caller asks for a watch and is answered immediately, because
 * the stream outlives the request that began it. One watch serves the whole cluster — a
 * `BlongDeployment` in any namespace is reconciled where it was declared — and each CR is coalesced
 * so a burst of events for one object becomes one pass.
 *
 * The module also owns the watch's *end*: `stopWatch`, called from the dispatch port's own `stop()`
 * on the way out, is the only handle anything outside has on this loop.
 */
/**
 * Whether the watch has been asked to stop, and the one thing a shutdown needs.
 *
 * The watch is closure state — the loop, its pending triggers and the generation map — and nothing
 * outside this module held a handle on any of it, so a terminating pod waited out its grace period
 * with a watch that was still renewing (the platform's `stop()` reaches the ports, and no port knew
 * this loop existed). Flipping this flag is what the dispatch port's `stop()` calls.
 *
 * What it deliberately does *not* do is abort the in-flight long poll: the abort handle belongs to
 * the adapter's own generator and is not exposed, so the poll would have to finish anyway. Nothing
 * waits for it either — the shutdown path calls `process.exit`, which is what closes the socket —
 * and refusing to renew is what stops the loop from opening another one. The flag is cleared when
 * the handler is called again, because a config reload stops and starts the port rather than
 * replacing the process (see `Watch.ts`'s `applyConfigReload`).
 */
let stopRequested = false;

/** Stop the watch: no renewal, and no new pass from it. Called by the dispatch port's `stop()`. */
export const stopWatch = (): void => {
    stopRequested = true;
};

export default handler(({handler}) => {
    const call = (name: string): ClusterCall | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function' ? (candidate as ClusterCall) : undefined;
    };

    let running: Promise<void> | undefined;
    let logger: Log | undefined;

    const loop = async (pass: IPassOptions, $meta: IMeta): Promise<void> => {
        const watch = call('clusterCustomWatch');
        const reconcile = call('kustomizeReconcileRun');
        if (!watch || !reconcile)
            return; /** The CRs this process knows about, so a resync can cover all of them. */
        const pending = new Map<string, ReturnType<typeof setTimeout>>();
        /**
         * The generation each CR was last reconciled at.
         *
         * Kept per watch, and only for this: it is what lets the loop tell a change someone made
         * from the status the loop itself just wrote.
         */
        const generation = new Map<string, number | undefined>();
        const trigger = (namespace?: string, name?: string, delay = COALESCE_MILLIS): void => {
            const key = `${namespace ?? ''}/${name ?? ''}`;
            if (pending.has(key)) return;
            pending.set(
                key,
                setTimeout(() => {
                    pending.delete(key);
                    // Fire and forget: a pass reports its own outcome in its own log record, and the
                    // stream must not wait for one to finish before it reads the next event. The
                    // settings are the caller's, so a read-only controller stays read-only here.
                    // Deliberately not awaited: a watch event must not block the stream. Which is why
                    // the failure is caught here — without this it escapes as an unhandled rejection
                    // and takes the operator down (T-229).
                    void reconcile({...pass, name, namespace}, $meta).catch(error =>
                        logger?.error?.({
                            $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                            message: `watch: reconcile failed: ${String(error)}`,
                        }),
                    );
                }, delay),
            );
        };
        for (;;) {
            // Asked to stop: leave before opening another watch. A pass already triggered is left to
            // finish on its own — the process is on its way out, and abandoning a reconcile halfway
            // is worse than letting one end where it was going.
            if (stopRequested) return;
            const started = Date.now();
            try {
                const answer = (await watch(
                    {
                        group: OPERATOR_GROUP,
                        version: OPERATOR_VERSION,
                        plural: OPERATOR_PLURAL,
                        // Cluster-wide: one operator serves every suite the cluster declares, and
                        // each event names the namespace its CR lives in.
                        namespaced: false,
                        timeout: WATCH_TIMEOUT_MILLIS,
                    },
                    $meta,
                )) as IWatchAnswer;
                logger?.info?.({
                    $meta: {mtid: 'event', method: 'cluster.custom.watch'},
                    message: `watch: open with ${
                        Array.isArray(answer?.existing?.items)
                            ? `${answer.existing.items.length} existing`
                            : 'no list'
                    }, stream ${
                        typeof (answer?.events as unknown as {next?: unknown})?.next === 'function'
                            ? 'present'
                            : 'absent'
                    }`,
                });
                // The stream lists before it streams, so acting on the list is what makes a restarted
                // operator converge: whatever changed while it was down is not in the stream.
                for (const item of answer?.existing?.items ?? []) {
                    const key = `${item.metadata?.namespace ?? ''}/${item.metadata?.name ?? ''}`;
                    generation.set(key, item.metadata?.generation);
                    trigger(item.metadata?.namespace, item.metadata?.name, 0);
                }
                for await (const event of answer?.events ?? []) {
                    // A deletion is left alone: reading it as an instruction to delete the suite's
                    // objects is what a finalizer is for, and this loop implements none.
                    if (event.type === 'ERROR' || event.type === 'DELETED') continue;
                    const metadata = event.object?.metadata;
                    const key = `${metadata?.namespace ?? ''}/${metadata?.name ?? ''}`;
                    // `generation` moves only for a change to the spec, which is the change a pass
                    // exists to answer. The status is the other half: the operator's own report is a
                    // modification of the same object, so watching every change makes the loop wake
                    // on its own writing — the status write triggers a pass, the pass writes the
                    // status, four times a second. A CR the list did not carry is new and unknown, so
                    // it is triggered without a generation to compare.
                    const seen = generation.get(key);
                    if (
                        metadata?.generation !== undefined &&
                        seen !== undefined &&
                        metadata.generation === seen
                    ) {
                        continue;
                    }
                    generation.set(key, metadata?.generation);
                    trigger(metadata?.namespace, metadata?.name);
                }
            } catch (error) {
                const text = String(error);
                // A long poll that ran out of time is the renewal working: the stream is reopened
                // and the list is read again, which is what keeps a change made while the operator
                // was busy from being missed. Reporting it as a failure would put an error in the
                // log every thirty seconds and hide the failures that matter.
                if (/timeout watching/i.test(text)) {
                    logger?.info?.({
                        $meta: {mtid: 'event', method: 'cluster.custom.watch'},
                        message: 'watch: renewed',
                    });
                } else {
                    logger?.error?.({
                        $meta: {mtid: 'event', method: 'cluster.custom.watch'},
                        message: `watch: failed, retrying: ${text}`,
                    });
                    await new Promise(resolve => setTimeout(resolve, WATCH_RETRY_MILLIS));
                }
                continue;
            }
            // A stream that ended at once is not a stream: pace the renewal rather than open watches
            // until the API server complains.
            const spent = Date.now() - started;
            if (spent < WATCH_MIN_CYCLE_MILLIS) {
                await new Promise(resolve => setTimeout(resolve, WATCH_MIN_CYCLE_MILLIS - spent));
            }
        }
    };

    return {
        kustomizeWatchRun(params: IPassOptions = {}, $meta?: IMeta): {watching: boolean} {
            const log = (this as unknown as {log?: Log}).log;
            const pass: IPassOptions = {
                apply: params.apply ?? false,
                prune: params.prune ?? false,
                from: params.from ?? 'cr',
            };
            // A stopped watch can be started again: a config reload stops and starts the port rather
            // than the process, and the module keeps its state across that. Without this the second
            // start would find `running` set and a loop that has already returned.
            if (stopRequested) {
                stopRequested = false;
                running = undefined;
            }
            if (!running) {
                logger = log;
                // Never awaited, so its rejection is reported here: an uncaught one would end the
                // process (T-229). The loop has its own per-cycle catch, so this only ever sees a
                // failure outside it.
                running = loop(pass, $meta as IMeta).catch(error =>
                    logger?.error?.({
                        $meta: {mtid: 'event', method: 'kustomize.watch.run'},
                        message: `watch: the loop ended: ${String(error)}`,
                    }),
                );
            }
            return {watching: true};
        },
    };
});
