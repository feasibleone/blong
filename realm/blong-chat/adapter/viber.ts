import {adapter} from '@feasibleone/blong';
import type {IChatAccountMap, IComponentK8sContribution} from '@feasibleone/blong/types';

/**
 * adapter/viber.ts — the Viber account of this realm.
 *
 * The same shape as the Slack instance, with one difference the platform forces: an account carries
 * the public URL it is registered with, and the port calls `set_webhook` from `ready`, so a new ngrok
 * hostname is a restart rather than a manual step (`@@D-677`). The `k8s` keys are in `default` for the
 * reason the Slack instance gives.
 */
export default adapter<
    {accounts?: IChatAccountMap; server?: {port?: number}} & IComponentK8sContribution
>(() => ({
    extends: 'adapter.viber',
    activation: {
        default: {
            namespace: 'viber',
            accounts: {},
            server: {port: 8096},
            k8sPorts: {chatViber: {port: 8096}},
            k8sIngresses: {chatViber: {path: '/chat/viber', servicePort: 8096}},
        },
    },
}));
