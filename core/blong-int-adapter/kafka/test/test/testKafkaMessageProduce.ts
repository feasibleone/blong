import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {brokerMessageProduce}}) => ({
    testKafkaMessageProduce: ({name = 'kafka message produce'}, $meta) =>
        group(name)([
            async function produceMessage(assert: typeof Assert, {$meta}) {
                const result = await brokerMessageProduce(
                    {topic: 'blong-integration', message: 'blong-integration-test'},
                    $meta,
                );
                assert.ok(result, 'Produce should return a result');
                assert.strictEqual(
                    (result as {sent?: boolean}).sent,
                    true,
                    'Produce should return sent: true',
                );
                return result;
            },
        ]),
}));
