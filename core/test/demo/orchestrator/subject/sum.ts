import {library} from '@feasibleone/blong';

export default library(
    ({error}) =>
        function sum(...params: number[]) {
            return params.reduce((prev, cur) => {
                if (cur < 0) throw error.subjectSum();
                return prev + cur;
            }, 0);
        }
);
