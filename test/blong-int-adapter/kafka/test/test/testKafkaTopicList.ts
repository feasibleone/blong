import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testKafkaTopicList — integration test for the commander explore vocabulary of
 * `adapter.kafka`:
 *   `broker.topic.list` → enumerate topics from broker metadata
 *   `broker.topic.find` → read a batch of recent messages (partitions are
 *                         surfaced as message metadata, not tree nodes)
 */
export default handler(
    ({lib: {group}, handler: {brokerMessageProduce, brokerTopicList, brokerTopicFind}}) => ({
        testKafkaTopicList: ({name = 'kafka topic explore list'}: {name?: string}) =>
            group(name)([
                async function listTopics(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = await brokerTopicList({}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'topic.list should return items');
                    assert.ok(
                        items.every(item => typeof (item as {topic?: string}).topic === 'string'),
                        'topic.list items should carry a topic name',
                    );
                    return result;
                },
                async function findMessages(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    await brokerMessageProduce(
                        {topic: 'blong-integration', message: 'commander-list-test-' + Date.now()},
                        $meta,
                    );
                    const result = await brokerTopicFind(
                        {topic: 'blong-integration', limit: 5},
                        $meta,
                    );
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'topic.find should return items');
                    return result;
                },
            ]),
    }),
);
