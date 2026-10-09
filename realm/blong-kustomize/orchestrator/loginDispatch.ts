import {orchestrator} from '@feasibleone/blong';

/**
 * orchestrator/loginDispatch.ts — the realm's login namespace.
 *
 * The portal refuses to render a page until it holds a token, and the method it calls to get one is
 * `login.token.create`. The framework's `login` realm is not loaded here — it brings a user store,
 * and this realm has no database — so the realm answers that one method itself, and the cluster is
 * the credential authority. See `orchestrator/login/loginTokenCreate.ts`.
 *
 * This is a dispatch port like the kustomize one, so the namespace is served by the same RPC server
 * and appears in the generated tree as one more Service. That last part is deliberate: in a split
 * deployment the browser reaches the gateway, and the gateway reaches `login` the same way it
 * reaches any other namespace.
 */
export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'login',
            imports: [/\.login$/],
        },
    },
}));
