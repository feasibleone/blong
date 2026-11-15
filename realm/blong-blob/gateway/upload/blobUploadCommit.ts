import {validation} from '@feasibleone/blong';

/**
 * `blob.upload.commit` — promote what the route wrote to a stored blob.
 *
 * The third call (`@@D-840`), and the one that may refuse: an abandoned form is `expired`, a write that
 * never landed is `incomplete`. The answer is the reference the field then holds, which is why the
 * caller never composes the `blob://` string itself.
 */
export default validation(
    async ({lib: {type}}) =>
        function blobUploadCommit() {
            return {
                params: type.Object({
                    namespace: type.String(),
                    key: type.String(),
                    scopes: type.Optional(type.Array(type.String())),
                    temporary: type.Optional(type.Boolean()),
                    cacheControl: type.Optional(type.String()),
                    /** The variants to derive besides the thumbnail, by name: `normal`, `crop`. */
                    variants: type.Optional(type.Array(type.String())),
                }),
                result: type.Object({
                    key: type.String(),
                    namespace: type.String(),
                    uri: type.String(),
                    size: type.Number(),
                    digest: type.String(),
                }),
            };
        },
);
