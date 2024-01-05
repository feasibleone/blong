import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function testDemoAdd() {
            return {
                auth: false,
                params: type.Any(),
                result: type.Any(),
            };
        }
);
