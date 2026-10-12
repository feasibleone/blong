import {orchestrator} from '@feasibleone/blong';

/**
 * orchestrator/sessionDispatch.ts — the realm's session namespace.
 *
 * The issuer a minted session is verified against has to answer for itself: the framework reads its
 * discovery document and then the key set that document names, over HTTP, before it can check a
 * token's signature. So the realm serves both, and this port is what makes them reachable — a
 * dispatch port like the kustomize, login and identity ones, so the namespace is served by the same
 * RPC server and appears in the generated tree as one more Service. See
 * `orchestrator/session/sessionOidcGetConfiguration.ts` and `sessionOidcGetKeys.ts`.
 *
 * The import pattern is what attaches the handler group to this port, and what it is tested against is
 * the name the realm knows the group by — `<realm>.<namespace>`, so `kustomize.session` here. A
 * pattern anchored at the front attaches nothing, silently: the port starts, answers every call with
 * `null`, and no handler is ever reached (F-495).
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'session',
            imports: [/\.session$/],
        },
    },
}));
