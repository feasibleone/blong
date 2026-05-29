import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function loginTokenCreate() {
            return {
                auth: 'login',
                params: type.Object({
                    username: type.String(),
                    password: type.String(),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
