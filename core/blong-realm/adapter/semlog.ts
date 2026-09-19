import {adapter} from '@feasibleone/blong';

/**
 * `semlog` — the realm's integration port: the semantic-log cluster service.
 *
 * It extends the framework's HTTP adapter, so the service is reached by URL and
 * nothing here knows whether it runs in this process (which is what a
 * development run and a test do — the framework starts it, see `log.cluster`),
 * on another host, or as a Kubernetes deployment. One path, three deployments.
 *
 * The group `adapter/semlog/` holds conversions rather than handlers: one
 * `<method>RequestSend` per read, which the port loop runs before the call and hands to
 * this adapter's own `exec`, and one `responseReceive` that passes the answer on. The
 * six reads differ only in the path they ask for and what they call the answer, so
 * there is no business logic to hold and nothing to coordinate — the framework's two
 * conversion seams are the whole implementation, and it is why this realm contains no
 * HTTP code of its own (no `fetch`, no call to `exec`).
 *
 * The methods themselves — parameters, wire names, routes — are declared by
 * `gateway/blong/` and reached through `orchestrator/blong.ts`, which forwards to this
 * port by name. The port's own name is therefore load-bearing: it is the `destination`
 * that orchestrator names.
 *
 * The name says *which* service, not what kind of thing it is: a port called
 * `service` names every adapter in every realm that has one, and this one is
 * the semantic log and nothing else.
 *
 * The URL is the base adapter's own key — the slice *it* reads its base address from — so
 * a deployment points the realm at its service by configuration alone, and the conversion
 * handlers above never see an address, a credential or a timeout.
 */
export default adapter<{url?: string}>(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'semlog',
            imports: [/\.semlog$/],
            // The port the framework's own in-process service binds
            // (`log.cluster.port`), so a development run needs no configuration
            // at all; a deployment points this at the service's address.
            url: 'http://127.0.0.1:9455',
        },
    },
}));
