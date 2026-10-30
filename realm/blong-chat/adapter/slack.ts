import {adapter} from '@feasibleone/blong';
import type {IChatAccountMap, IComponentK8sContribution} from '@feasibleone/blong/types';

/**
 * adapter/slack.ts — the Slack account of this realm.
 *
 * A thin instance: the protocol lives in `core/blong-gogo`, and what is left here is what a deployment
 * decides — the credentials (kept out of the source, in `.blong_devrc` or a Secret), the port, and the
 * address the platform posts to (`@@D-679`).
 *
 * The `k8s` keys declare both halves a webhook needs and neither exists without the other: the port
 * the process opens, and the Ingress path that reaches it. `k8sIngresses` resolves the Service from the
 * realm that declared it, which is why the port name is not repeated there (`@@D-680`).
 *
 * They sit in `default` rather than in a `k8s` block on purpose: a `k8s` block merges only while that
 * intent is active, and the operator regenerates the tree from its release run — a contribution it
 * could not see is one it would report as drift and prune.
 */
export default adapter<
    {accounts?: IChatAccountMap; server?: {port?: number}} & IComponentK8sContribution
>(() => ({
    extends: 'adapter.slack',
    activation: {
        default: {
            namespace: 'slack',
            // Credentials only: an account is added by the rc file or by a mounted Secret.
            accounts: {},
            server: {port: 8095},
            k8sPorts: {chatSlack: {port: 8095}},
            k8sIngresses: {chatSlack: {path: '/chat/slack', servicePort: 8095}},
        },
    },
}));
