import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function accessTestPublic() {
            return {
                auth: false,
                params: type.Object({}),
                result: type.Object({success: type.Boolean()}),
            };
        },
);
