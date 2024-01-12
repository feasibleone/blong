import {IMeta, handler} from '@feasibleone/blong';

interface ISchema {
    /** @description "array of numbers to sum" */
    params: number[];
    /** @description "calculated sum" */
    result: number;
}

export default handler(
    ({lib: {sum}}) =>
        function subjectNumberSum(params: ISchema['params'], $meta: IMeta): ISchema['result'] {
            return sum(params);
        }
);
