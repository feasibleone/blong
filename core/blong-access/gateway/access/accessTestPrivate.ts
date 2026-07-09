import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function accessTestPrivate() {
            return {
                params: type.Object({}),
                result: type.Object({success: type.Boolean()}),
            };
        },
);
