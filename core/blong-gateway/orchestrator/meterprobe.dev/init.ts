import {orchestrator} from '@feasibleone/blong';

/**
 * Dev-only metering probe namespace: `meterprobe`.
 *
 * Test-only metered routes (`meterprobe.rate` / `meterprobe.credit`) that the
 * real HTTP metering test uses to prove the ApiGateway plugin is on the
 * request path (plugin-only 429s). A dev-only dispatch orchestrator: the
 * `.dev` handler group loads only under the `dev` intent, so the
 * `ports.meterprobe.request` dispatch (to the `db` backend) never exists in
 * production.
 */
export default orchestrator<{destination?: string}>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'meterprobe',
            destination: 'db',
        },
    },
}));
