import {orchestrator} from '@feasibleone/blong';

/**
 * orchestrator/identityDispatch.ts — the realm's identity namespace.
 *
 * A verified token is completed with a session before the call that carried it runs: the framework
 * asks the `identity` namespace for `identity.checkInternal`, and what comes back says which keys
 * the caller's body is signed with and which key its answer is encrypted to (`GatewayCodec.session`
 * fills `enc`/`sig`/`ses` from it, `jwt.ts` turns those into the request's credentials). The
 * framework's answer to that question is the login realm's, and the login realm is not loaded here —
 * it brings a user store, and this realm has none — so the realm serves the namespace itself; see
 * `orchestrator/identity/identityCheckInternal.ts`.
 *
 * This is a dispatch port like the kustomize and login ones, so the namespace is served by the same
 * RPC server and appears in the generated tree as one more Service. That the answer is a *local*
 * one is what matters here: the keys the session hands back are the ones this process recorded at
 * login, so the namespace has to resolve to the process that verifies the token — the operator
 * itself, for the operator's own gateway (`canSkipSocket` reaches a handler in this process first).
 *
 * The import pattern is what attaches the handler group to this port, and what it is tested against
 * is the name the realm knows the group by — `<realm>.<namespace>`, so `kustomize.identity` here. A
 * pattern anchored at the front (`/^identity/`) matches the *method* spelling and attaches nothing,
 * which is silent: the port starts, answers every call with `null`, and the handler is never
 * reached (F-495). `/\\.identity$/` is the shape the login port next door uses for the same reason.
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'identity',
            imports: [/\.identity$/],
        },
    },
}));
