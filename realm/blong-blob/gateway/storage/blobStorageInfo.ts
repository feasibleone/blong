import {validation} from '@feasibleone/blong';

/**
 * `blob.storage.info` — the read a deployment probe and the widget's session call.
 *
 * Authenticated, but not privileged: the answer says what the store can do, which a client needs to pick a
 * transport, and it names no key and no record (@@D-838).
 */
export default validation(
    async ({lib: {type}}) =>
        function blobStorageInfo() {
            return {
                params: type.Object({}),
                result: type.Object({
                    backend: type.String(),
                    streams: type.Boolean(),
                    ranges: type.Boolean(),
                    metadataCeiling: type.Union([type.Number(), type.Null()]),
                    base64Ceiling: type.Number(),
                    lastFailure: type.Optional(
                        type.Union([
                            type.Null(),
                            type.Object({at: type.String(), reason: type.String()}),
                        ]),
                    ),
                }),
            };
        },
);
