import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function $subject$ObjectGet() {
            return {
                params: type.Object({$objectId: type.String()}),
                result: type.Unknown(),
            };
        },
);
