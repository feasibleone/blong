import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function testRunCancel() {
            return {
                params: type.Object({runId: type.String()}),
                result: type.Object({success: type.Boolean()}),
            };
        },
);
