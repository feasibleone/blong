import {validation} from '@feasibleone/blong';

/**
 * `blob.blob.get` — a blob's record, and its bytes when the caller asks for them embedded.
 *
 * The record is what a page reads to know what a stored file *is*: a key carries no extension, so
 * without this answer an image would draw as a plain file icon (`@@D-842`). `content: 'base64'` is the
 * small-payload path, bounded by the store's own ceiling; anything larger travels as bytes from the
 * served route (`@@D-840`).
 *
 * `crypto` is not declared: the algorithm and the IV are what the store needs to read its own file
 * back, and they are no part of what a page may see. The response serializer drops what is undeclared,
 * which is the same decision written twice.
 */
export default validation(
    async ({lib: {type}}) =>
        function blobBlobGet() {
            return {
                params: type.Object({
                    namespace: type.String(),
                    key: type.String(),
                    content: type.Optional(type.Literal('base64')),
                }),
                result: type.Object({
                    key: type.String(),
                    namespace: type.String(),
                    /** `blob://namespace/key` — the value a record holds for it. */
                    uri: type.String(),
                    contentType: type.String(),
                    size: type.Number(),
                    digest: type.String(),
                    createdAt: type.String(),
                    createdBy: type.Optional(type.String()),
                    scopes: type.Array(type.String()),
                    scopeMode: type.Union([type.Literal('any'), type.Literal('all')]),
                    state: type.Union([type.Literal('pending'), type.Literal('stored')]),
                    temporary: type.Boolean(),
                    expiresAt: type.Optional(type.Union([type.String(), type.Null()])),
                    originalFilename: type.Optional(type.String()),
                    cacheControl: type.Optional(type.String()),
                    variants: type.Optional(
                        type.Record(
                            type.String(),
                            type.Object({
                                key: type.String(),
                                width: type.Optional(type.Number()),
                                height: type.Optional(type.Number()),
                            }),
                        ),
                    ),
                    content: type.Optional(type.String()),
                }),
            };
        },
);
