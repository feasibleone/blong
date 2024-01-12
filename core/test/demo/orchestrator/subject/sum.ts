import {library} from '@feasibleone/blong';

export default library(
    ({errors}) =>
        function sum(params: number[]) {
            return params.reduce((prev, cur) => {
                if (cur < 0) throw errors.subjectSum();
                return prev + cur;
            }, 0);
        }
);
