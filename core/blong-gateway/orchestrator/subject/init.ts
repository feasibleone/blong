import {handler} from '@feasibleone/blong';

/**
 * The gateway realm's contribution to the shared `subject` orchestrator port
 * (blong-server). Declaring a namespace here gives it a `ports.<ns>.request`
 * dispatch that routes `{ns}.*` calls to the `db` backend — required for any
 * gateway HTTP route (the route handler 404s "namespace not found" otherwise).
 *
 * Only `gateway` (the management routes) is declared here. The dev-only
 * demo / metering-probe namespaces (`vision`, `customer`, `meterprobe`) get
 * their own dev-only dispatch orchestrators under `orchestrator/*.dev/`, so
 * they never exist outside the `dev` intent.
 */
export default handler(() => ({
    namespace: 'gateway',
}));
