import {validation} from '@feasibleone/blong';

/**
 * `blob.blob.find` — what one namespace holds, narrowed by a prefix or by an expiry.
 *
 * The store's index is the only listing there is, because this realm keeps no database (`@@D-837`). It
 * is an administrator's answer — it names keys nobody referenced — so the rule that grants it is the
 * same one that grants `blob.storage.info` (`@@D-845`). A record's detail is `blob.blob.get`; the item
 * here carries what a listing row shows.
 */
export default validation(
    async ({lib: {type}}) =>
        function blobBlobFind() {
            return {
                params: type.Object({
                    namespace: type.String(),
                    prefix: type.Optional(type.String()),
                    /** ISO 8601: only what may be removed at this moment. */
                    expiredBefore: type.Optional(type.String()),
                }),
                result: type.Object({
                    blob: type.Array(
                        type.Object(
                            {
                                key: type.String(),
                                namespace: type.String(),
                                contentType: type.String(),
                                size: type.Number(),
                                digest: type.String(),
                                createdAt: type.String(),
                                state: type.Union([type.Literal('pending'), type.Literal('stored')]),
                                temporary: type.Boolean(),
                                expiresAt: type.Optional(type.Union([type.String(), type.Null()])),
                                originalFilename: type.Optional(type.String()),
                            },
                            {additionalProperties: true},
                        ),
                    ),
                }),
            };
        },
);
