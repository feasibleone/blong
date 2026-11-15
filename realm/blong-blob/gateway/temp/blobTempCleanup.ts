import {validation} from '@feasibleone/blong';

/**
 * `blob.temp.cleanup` — the sweep a deployment's scheduler calls.
 *
 * Bearer auth, because a sweep is an administrative act and an anonymous caller would let anyone
 * reclaim storage. The schedule is the deployment's (@@D-840); this route is what it calls.
 */
export default validation(
    async ({lib: {type}}) =>
        function blobTempCleanup() {
            return {
                params: type.Object({
                    namespaces: type.Optional(type.Array(type.String())),
                    now: type.Optional(type.String()),
                }),
                result: type.Object({removed: type.Number(), bytes: type.Number()}),
            };
        },
);
