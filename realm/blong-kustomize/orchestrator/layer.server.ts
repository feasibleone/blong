import {layer} from '@feasibleone/blong';

/**
 * orchestrator/layer.server.ts — the `kustomize` orchestrator layer.
 *
 * Loaded wherever the realm is, which is two places by design: the `k8s` intent's short-lived
 * generator, and any process that names the realm itself (its own entry, its CLI, and the operator,
 * whose entry loads the realm through its own `children`). A *business* process does not carry it —
 * the framework's realm list names the intents this realm is meaningful under (see
 * `frameworkRealms` in `core/blong-gogo/src/load.ts`), because a suite declaring the package so that
 * a `k8s` run can write a tree is not a statement about the processes that suite deploys. A process
 * that does want the read API says so with `framework.realms: {kustomize: true}`.
 *
 * `deploy.ts` gates the *writing* behind the `generateManifests` activation key, so a serving
 * process never generates.
 *
 * Declared explicitly because the well-known default for an `orchestrator` folder covers the
 * `microservice`, `k8s` and `upgrade` intents: a *serving* process that opts into this realm for its
 * read API runs none of those, so without this the handlers would never register there.
 */
export default layer({
    default: true,
});
