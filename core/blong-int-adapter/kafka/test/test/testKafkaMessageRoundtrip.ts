import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {messages} from '../fixtures/message.ts';

type ProduceResult = {sent?: boolean; topic?: string; partition?: number};
type StepMeta = {$meta: Record<string, unknown>};

/**
 * testKafkaMessageRoundtrip — integration test covering Kafka produce/consume
 * round-trips with various payload shapes.
 *
 * Each step produces a message and verifies the response returned by the
 * KafkaJsonCodec (which reads back via the consumer stream).
 */
export default handler(
    ({lib: {group}, handler: {brokerMessageProduce}}) => ({
        testKafkaMessageRoundtrip: ({name = 'kafka message round-trip'}: {name?: string}) =>
            group(name)([
                // ── 1. String payload round-trip ──────────────────────────
                async function stringPayload(assert: typeof Assert, {$meta}: StepMeta) {
                    const msg = messages[0];
                    const result = await brokerMessageProduce(
                        {topic: msg.topic, message: msg.payload, source: msg.source},
                        $meta,
                    );
                    assert.ok(result, 'String payload: produce returned a result');
                    assert.strictEqual(
                        (result as ProduceResult).sent,
                        true,
                        'String payload: sent should be true',
                    );
                    assert.strictEqual(
                        (result as ProduceResult).topic,
                        msg.topic,
                        'String payload: topic echoed back correctly',
                    );
                    assert.strictEqual(
                        typeof (result as ProduceResult).partition,
                        'number',
                        'String payload: partition is a number',
                    );
                    return result as ProduceResult;
                },

                // ── 2. Numeric payload round-trip ─────────────────────────
                async function numericPayload(
                    assert: typeof Assert,
                    {$meta, stringPayload}: StepMeta & {stringPayload: Promise<ProduceResult>},
                ) {
                    await stringPayload;
                    const msg = messages[1];
                    const result = await brokerMessageProduce(
                        {topic: msg.topic, message: msg.payload, source: msg.source},
                        $meta,
                    );
                    assert.ok(result, 'Numeric payload: produce returned a result');
                    assert.strictEqual(
                        (result as ProduceResult).sent,
                        true,
                        'Numeric payload: sent should be true',
                    );
                    return result as ProduceResult;
                },

                // ── 3. Object payload round-trip ──────────────────────────
                async function objectPayload(
                    assert: typeof Assert,
                    {$meta, numericPayload}: StepMeta & {numericPayload: Promise<ProduceResult>},
                ) {
                    await numericPayload;
                    const msg = messages[2];
                    const result = await brokerMessageProduce(
                        {topic: msg.topic, message: msg.payload, source: msg.source},
                        $meta,
                    );
                    assert.ok(result, 'Object payload: produce returned a result');
                    assert.strictEqual(
                        (result as ProduceResult).sent,
                        true,
                        'Object payload: sent should be true',
                    );
                    return result as ProduceResult;
                },

                // ── 4. Default partition is zero ──────────────────────────
                async function defaultPartition(
                    assert: typeof Assert,
                    {$meta, objectPayload}: StepMeta & {objectPayload: Promise<ProduceResult>},
                ) {
                    await objectPayload;
                    const result = await brokerMessageProduce(
                        {topic: 'blong-integration', message: 'partition-check'},
                        $meta,
                    );
                    assert.ok(result, 'Default partition: produce returned a result');
                    assert.strictEqual(
                        (result as ProduceResult).partition,
                        0,
                        'Default partition is 0',
                    );
                    return result as ProduceResult;
                },
            ]),
    }),
);
