import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function testRunEventFind() {
            return {
                params: type.Object({
                    runId: type.String(),
                    cursor: type.Optional(type.Number()),
                }),
                result: type.Object(
                    {
                        events: type.Array(type.Object({}, {additionalProperties: true})),
                        done: type.Boolean(),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
