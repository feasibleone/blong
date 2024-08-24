import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function $subject$ObjectGet() {
            return {
                params: type.Object({eventId: type.String()}),
                result: type.Any(),
            };
        }
);
