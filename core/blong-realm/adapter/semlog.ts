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
/**
 * The service's address, as this process publishes it.
 *
 * The framework starts the cluster service for a development or test run and binds it
 * on a port the operating system chooses — two framework processes on one machine are
 * ordinary (a dev server beside a Playwright run, or CI running packages in parallel)
 * and a fixed port leaves the second one with no service while its readers keep talking
 * to the first one's. Only the process that bound it knows which port that is, so the
 * framework publishes it on the manifest, and the reader takes it from there.
 *
 * Read as a *string* rather than as the manifest's value, because the manifest proxy
 * answers an unpublished property with a placeholder that resolves when someone writes
 * it: a run with no in-process service (a deployment, or a suite that pointed its
 * readers at a service elsewhere) would otherwise hand a thenable to the HTTP adapter as
 * its base address.
 */
const IN_PROCESS_URL = 'http://127.0.0.1:9455';

function serviceUrl(manifest: {clusterUrl?: unknown} | undefined): string {
    const published = manifest?.clusterUrl;
    return typeof published === 'string' && published.length > 0 ? published : IN_PROCESS_URL;
}

export default adapter<{url?: string}>(api => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'semlog',
            imports: [/\.semlog$/],
            // The service this process runs, when it runs one; the conventional port
            // (`log.cluster.port`'s default) otherwise, which is what a suite with no
            // in-process service and no configuration of its own gets. A deployment
            // points this at the service it runs, by configuring the port.
            url: serviceUrl(api.manifest),
        },
    },
}));
