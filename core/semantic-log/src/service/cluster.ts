/**
 * Reaching the cluster service: start one here, or point the sink at one that runs.
 *
 * This is the one place that knows both halves of the package — the service's
 * process and the transport that talks to it — and it lives on the service side for
 * that reason: the emitter's half may not reach the service at all, not even as a
 * type, because the package's own `emitter-entry` test walks relative specifiers out
 * of the emitter's entry and the service imports `fastify`. A log on the emitter
 * side therefore *takes* this function as an option (`LogBaseOptions.openCluster`)
 * instead of importing it, and the shape it is declared by lives on that side, where
 * it has to — this module only implements it.
 *
 * Either way it returns something to write to or nothing at all, and nothing here
 * can fail a process: a service whose port is taken is reported through the caller's
 * reporter and dropped, and the caller is left with no sink rather than with a queue
 * behind a service that was never started.
 */

import type {ClusterOpener, ClusterOptions, ClusterReporter, OpenedCluster} from '../logBase.ts';
import {startService} from './start.ts';
import {createServiceWriter} from './transport.ts';

/**
 * Start the service when the options ask for it, then open the sink that writes to
 * it.
 *
 * `url` wins over `enabled`: a deployment points the sink at the service it already
 * runs, and a development run starts its own. Both set, and nothing is started here —
 * which is what lets a process attach to a service that is already drawing the
 * picture. When one is started, its `stop` is what `close` calls, so a log that
 * opened a service is also what ends it.
 */
export const openCluster: ClusterOpener = async (
    options: ClusterOptions,
    report: ClusterReporter,
): Promise<OpenedCluster | undefined> => {
    let url = options.url;
    let stop: (() => Promise<void>) | undefined;
    if (url === undefined) {
        const running = await startService({
            port: options.port,
            host: options.host,
            persistTo: options.persistTo,
            onError: error => report(error, 'start'),
        });
        if (running === undefined) {
            return undefined;
        }
        url = running.url;
        stop = running.stop;
    }
    const sink = createServiceWriter({
        url,
        ...(options.sendLimit === undefined ? {} : {sendLimit: options.sendLimit}),
        onError: error => report(error, 'send'),
    });
    return {
        sink,
        close: async (): Promise<void> => {
            await sink.flush();
            await stop?.();
        },
    };
};
