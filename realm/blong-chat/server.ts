import {realm} from '@feasibleone/blong';

/**
 * server.ts — the `chat` realm entry point (server platform).
 *
 * The realm is a bridge with a small amount of state: the bot accounts it serves and the workspace
 * whose app-configuration token maintains their apps (`@@D-797`), plus the conversations it has met
 * (`@@D-725`). Everything else it needs — those tables, the seeds and the model pages — is a
 * well-known layer folder beside this file, which is why none of them is listed here.
 *
 * The realm carries a `config` block even though it has nothing to configure, because a realm's own
 * answer travels with it: `k8sRealmRole` is what a deployment reads when it decides whether this is a
 * process of its own, and it belongs here rather than in the suite that deploys it (`@@D-437`).
 */
export default realm(() => ({
    url: import.meta.url,
    config: {default: {k8s: {k8sRealmRole: 'service'}}},
}));
