import {validation} from '@feasibleone/blong';

/**
 * `blob.upload.discard` — take back an upload, whatever state it reached.
 *
 * A cancelled form calls this, and so does the sweep for a record nobody came back for (`@@D-840`). The
 * answer says whether there was anything to remove, because a discard that finds nothing is not a
 * failure — the sweep may have got there first.
 */
export default validation(
    async ({lib: {type}}) =>
        function blobUploadDiscard() {
            return {
                params: type.Object({namespace: type.String(), key: type.String()}),
                result: type.Object({discarded: type.Boolean()}),
            };
        },
);
