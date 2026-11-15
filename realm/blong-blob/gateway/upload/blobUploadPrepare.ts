import {validation} from '@feasibleone/blong';

/**
 * `blob.upload.prepare` — reserve a key and learn where the bytes go.
 *
 * The first of the three calls an upload is (`@@D-840`): the widget sends what it is about to send, the
 * store answers the route to `PUT` it to, and nothing but the caller's own authority decides the
 * namespace — the administrator's rule is what grants this method at all (`@@D-845`).
 *
 * `size` is declared because the store refuses a file over its ceiling *before* a byte is written, and a
 * refusal the browser can show is worth more than one that arrives after a long upload.
 */
export default validation(
    async ({lib: {type}}) =>
        function blobUploadPrepare() {
            return {
                params: type.Object({
                    namespace: type.String(),
                    contentType: type.Optional(type.String()),
                    filename: type.Optional(type.String()),
                    size: type.Optional(type.Number()),
                    scopes: type.Optional(type.Array(type.String())),
                    temporary: type.Optional(type.Boolean()),
                }),
                result: type.Object({
                    key: type.String(),
                    namespace: type.String(),
                    /** `blob://namespace/key` — what a record would hold once the bytes are committed. */
                    uri: type.String(),
                    /** The route the bytes go to, absolute enough for a `fetch` from the page. */
                    uploadUrl: type.String(),
                    expiresAt: type.String(),
                }),
            };
        },
);
