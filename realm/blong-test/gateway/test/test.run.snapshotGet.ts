import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function testRunSnapshotGet() {
            return {
                params: type.Object({runId: type.String()}),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
