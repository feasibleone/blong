import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function loginTokenRefresh() {
            return {
                auth: 'login',
                params: type.Object({
                    refreshToken: type.String(),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
