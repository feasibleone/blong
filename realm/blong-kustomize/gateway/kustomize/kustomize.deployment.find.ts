import {validation} from '@feasibleone/blong';

/**
 * gateway/kustomize.deployment.find.ts — the deployment list, reachable from the page.
 *
 * The file name is the method it validates, and that is what puts the method on the gateway: the
 * read API is only served for the methods a gateway file names, so the handler behind it — an
 * orchestrator method, in this realm — is otherwise internal and the page's own list call is
 * answered with `Not Found` while the model still renders (F-497). Authenticated by default, which
 * is what this route wants: the page holds the cluster token and the gateway verifies it against the
 * cluster's own issuer.
 *
 * The result is left open on purpose, the same way the login response is: what the model reads is
 * the shape the browser's model system defines, and restating it here would be a second definition
 * of a contract this realm does not own.
 */
export default validation(
    async ({lib: {type}}) =>
        function kustomizeDeploymentFind() {
            return {
                params: type.Object({
                    // The namespace to list, and the only thing a caller chooses: the rest of the
                    // listing is what the cluster says about it.
                    namespace: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
