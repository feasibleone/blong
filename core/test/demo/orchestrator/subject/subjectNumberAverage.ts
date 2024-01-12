import {IMeta, handler} from '@feasibleone/blong';

export default handler<{
    precision: number;
}>(
    ({
        config: {
            precision, // access configuration
        },
        handler: {
            mathNumberSum, // handler
        },
    }) =>
        async function mathNumberAverage(numbers: number[], $meta: IMeta) {
            return (((await mathNumberSum(numbers, $meta)) as number) / numbers.length).toPrecision(
                precision
            );
        }
);
