import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function $subject$ObjectAdd() {
            return {
                params: type.Object({name: type.String()}),
                result: type.Unknown(),
            };
        },
);
