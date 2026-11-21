import {realm} from '@feasibleone/blong';

/**
 * server.ts — the `viewer` realm's server entry point.
 *
 * The realm is a reader with one piece of state: a bounded buffer of the
 * records the processes wrote to it (`@@D-946`). Everything else it needs is a
 * well-known layer folder beside this file — `adapter/log.ts` for the UDP
 * listener, `adapter/log/` for the two handlers the gateway serves, `gateway/`
 * for their schemas, `meta/db/` for the capability that opens the page.
 *
 * There is no database and no `srv` subject orchestrator: nothing here is a row.
 * The scaffold's models, seeds and fixtures were removed for that reason, and
 * the capability seed is the one `meta/` file the realm keeps — it is written by
 * the deployment's migration into blong-access's own tables, not into ours.
 *
 * `k8sRealmRole: 'service'` says this realm *can* be a process of its own
 * (`@@D-947`), which the split profiles use to give the UDP listener a single
 * owner. In a monolith
 * — and every suite that publishes a portal today — the realm rides the suite's
 * one process, so the page's `viewer.entry.find` reaches the gateway that served
 * the page. No Ingress and no proxy are involved: the reader's calls go to the
 * origin it was loaded from.
 */
export default realm(() => ({
    url: import.meta.url,
    config: {default: {k8s: {k8sRealmRole: 'service'}}},
}));
