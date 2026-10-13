import {validation} from '@feasibleone/blong';

/**
 * gateway/kustomize.deployment.find.ts — the deployment list, reachable from the page: the file name
 * is the method it validates (@@F-497).
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
