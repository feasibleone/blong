import { handler } from '@feasibleone/blong';

interface schema {
    /** @description "array of numbers to sum" */
    params: number[]
    /** @description "calculated sum" */
    result: number
}

export default handler(({
    lib: {
        sum
    }
}) => function subjectNumberSum(params: schema['params'], $meta): schema['result'] {
    return sum(...params);
});
