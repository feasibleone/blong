import {validation} from '@feasibleone/blong';

/**
 * gateway/kustomize/kustomize.release.approve.ts — the release trigger.
 *
 * The operator already serves the kustomize gateway, and `kustomize.release.notify` patches the
 * `BlongDeployment` the operator converges from (@@D-639). This route is the external door to it:
 * `auth: false` because the gate is the shared token in the params, not a bearer or an MLE
 * handshake — a CI runner has neither, and the ingress TLS is what protects the secret in transit.
 * The token is checked by the handler before any cluster call; this file only says what a caller
 * may say.
 */
export default validation(
    async ({lib: {type}}) =>
        function kustomizeReleaseApprove() {
            return {
                auth: false,
                params: type.Object({
                    /** The shared secret the operator was started with; never logged. */
                    token: type.String(),
                    /** The `BlongDeployment` to patch, by its own name. */
                    suite: type.String(),
                    /** The tenant namespace; the operator's own config answers when omitted. */
                    namespace: type.Optional(type.String()),
                    /** The suite version the release publishes. */
                    version: type.String(),
                    /** Where the artifact can be fetched. */
                    artifactUrl: type.Optional(type.String()),
                    /** sha256 of that artifact, which names its volume. */
                    artifactDigest: type.Optional(type.String()),
                    /** The framework image, when the release moved it. */
                    frameworkImage: type.Optional(type.String()),
                    /** The framework version the release was built against. */
                    frameworkVersion: type.Optional(type.String()),
                }),
                // Left open: the answer is the notify handler's own report, and a caller reads
                // `updated` and `reason` from it rather than from a second contract.
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
