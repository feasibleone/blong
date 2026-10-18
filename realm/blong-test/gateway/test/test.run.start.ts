import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function testRunStart() {
            return {
                params: type.Object({
                    method: type.String(),
                    name: type.Optional(type.String()),
                }),
                result: type.Object(
                    {
                        runId: type.String(),
                        run: type.Object({}, {additionalProperties: true}),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
