import {adapter} from '@feasibleone/blong';
import type {Adapter, AdapterContext, IComponentK8sContribution} from '@feasibleone/blong/types';
import {
    createFanoutWriter,
    createUdpWriter,
    getWriter,
    setWriter,
    stdoutWriter,
} from '@feasibleone/lukaot/node';

import {viewerUdpPort} from '../devPort.ts';
import {closeReceiver, openReceiver, storeOf} from './log/store.ts';

/**
 * adapter/log.ts — the UDP listener that makes this realm a log receiver.
 *
 * Every process writes what it emits to `log.destination`; in a deployment
 * that destination is this adapter, because it is the one place a suite points
 * all of its processes at (`@@D-946`). The records land in
 * `adapter/log/store.ts`, and the gateway reads them from there.
 *
 * `k8sPorts` declares the half a deployment cannot infer: the realm gains a
 * Service of its own name carrying this UDP port beside `rpc` and `http`, and
 * that Service is what every other process's `log.destination` names and what a
 * call from another process crosses (`@@D-950`). It sits in `default` rather than
 * in a `k8s` block on purpose — a `k8s` block merges only while that intent is
 * active, and the operator regenerates the tree from its release run, so a
 * contribution it could not see is one it would report as drift and prune.
 *
 * No Ingress: the page reads `viewer.entry.*` from the gateway that served it,
 * which is the same origin it was loaded from. A split deployment that puts this
 * realm in a process of its own needs nothing more, because the port below is
 * what the call crosses: the tree publishes a Service named after the realm
 * carrying `rpc`, `http` and this UDP port, so a call from the portal's process
 * and a record from any process of the deployment are both addressed by the
 * realm's name (`@@D-950`).
 */
export interface IViewerLogConfig extends IComponentK8sContribution {
    /** The UDP port records arrive on. */
    udpPort?: number;
    /** The interface it binds: `0.0.0.0` in a container, a loopback locally. */
    host?: string;
    /** How many records are kept before the oldest is dropped. */
    bufferSize?: number;
    /**
     * Whether the receiver also becomes this process's destination when the configuration named
     * none. On where a suite is run from source; off in a deployment, where every process names the
     * Service that carries the records and a receiver that pointed the process at itself would keep
     * them in its own pod.
     */
    destinationWhenUnset?: boolean;
}

export default adapter<IViewerLogConfig>((api) => ({
    activation: {
        default: {
            // The port answers the realm's namespace (`@@D-947`), which is what
            // makes a `viewer.*` call resolvable in-process: `_findMethod` walks the
            // dotted name down to the first registered port, and with no port
            // claiming `viewer` every call leaves the process for a Service
            // nobody runs.
            namespace: 'viewer',
            // The group this port serves: `adapter/log/` in the realm, by its name rather than by a
            // pattern. A regex is for a port that gathers groups from several realms — `srv`'s
            // orchestrator, the test dispatch ports — and this port serves one realm's one group, so
            // the name says the whole truth and a second `.log` folder elsewhere cannot be swept in
            // by accident. Without the entry the handlers are registered on no port, and the call
            // that arrives here finds no handler.
            imports: ['viewer.log'],
            // Derived per package, not fixed: every suite that loads the viewer would otherwise
            // bind the same UDP port, and CI runs their packages side by side (`@@D-953`). The
            // *declared* port stays 9999, because that is what a deployment's Service targets —
            // a tree must not carry a number that depends on where it was generated.
            udpPort: viewerUdpPort(),
            host: '0.0.0.0',
            bufferSize: 10000,
            destinationWhenUnset: true,
            k8sPorts: {viewerLogUdp: {port: 9999, protocol: 'UDP'}},
        },
        // A deployed process binds the port its Service publishes, whatever tree it was built in,
        // and never makes itself the destination: the suite names the Service that carries the
        // records to whichever process holds this receiver.
        release: {udpPort: 9999, destinationWhenUnset: false},
    },
    async start(this: Adapter<IViewerLogConfig, AdapterContext>) {
        // The port's loop, before anything else: `connect()` is what creates
        // the queue and what settles `connected()`, and a base adapter that
        // never calls it makes the platform's `start` wait on a promise that
        // never resolves (`@@F-651`).
        super.connect();
        const result = await super.start();
        const config = this.config as IViewerLogConfig;
        storeOf(config.bufferSize);
        await openReceiver({
            port: config.udpPort,
            host: config.host,
        });
        // A process nobody told where its records go gets this receiver: the realm is what the
        // process has beside it, and a suite that loads the viewer means its page to show its own
        // run (`@@D-953`). A configured destination always wins — that is the deployment's Service,
        // and the suite writes it — so what this fills is the gap a run from source leaves, which is
        // why a suite that loads the realm may name the realm alone and say nothing about the
        // address (`@@D-930`). The manifest is the only place the answer is published: by the time a
        // realm starts, the log has a writer either way.
        const told = (api.manifest as {logDestination?: unknown} | undefined)?.logDestination;
        if (config.destinationWhenUnset !== false && told !== true) {
            const port = config.udpPort ?? 9999;
            setWriter(
                createFanoutWriter([
                    getWriter() ?? stdoutWriter,
                    createUdpWriter({
                        // A receiver that binds every interface is still reached on the loopback:
                        // the address is the one this process sends *to*, not the one it answers on.
                        host: !config.host || config.host === '0.0.0.0' ? '127.0.0.1' : config.host,
                        port,
                    }),
                ]),
            );
        }
        return result;
    },
    async stop(...params: unknown[]) {
        try {
            await closeReceiver();
        } finally {
            return await super.stop(...params);
        }
    },
}));
