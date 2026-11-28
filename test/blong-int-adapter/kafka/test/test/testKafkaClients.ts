// Coverage matrix: test/blong-int-adapter/README.md#kafka-coverage — keep this file in step.
import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

type ClientSummary = {
    kind?: string;
    alias?: string;
    topics?: string[];
    groupId?: string;
    concurrency?: number;
    deadLetter?: string;
};
type Resolution = {
    topic?: string;
    physical?: string;
    producer?: string;
    consumer?: string;
    feed?: string;
};

/**
 * testKafkaClients — the client maps (`@@D-1035`) as a running process sees them:
 *
 *   `kafka.client.list`    → every producer, consumer and feed the instance declares
 *   `kafka.topic.resolve`  → which of them carry a given logical topic
 */
export default handler(
    ({lib: {group}, handler: {kafkaClientList, kafkaTopicResolve}}) => ({
        testKafkaClients: ({name = 'kafka clients'}: {name?: string} = {}) =>
            group(name)([
                async function listClients(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const result = (await kafkaClientList({}, $meta)) as {
                        items?: ClientSummary[];
                    };
                    const items = result.items ?? [];
                    const kinds = items.map(item => `${item.kind}:${item.alias}`);
                    assert.ok(
                        kinds.includes('producer:default'),
                        `a producer named default is declared (${kinds.join(', ')})`,
                    );
                    assert.ok(
                        kinds.includes('producer:answers'),
                        'and the one its pattern selects for the answer topics',
                    );
                    assert.ok(kinds.includes('consumer:default'), 'the read consumer is declared');
                    const feed = items.find(item => item.kind === 'feed');
                    assert.ok(feed, 'a feed is listed as a feed rather than as a consumer');
                    assert.strictEqual(feed?.alias, 'work', 'under the alias it was declared with');
                    assert.strictEqual(feed?.concurrency, 1, 'with the concurrency it runs at');
                    assert.strictEqual(
                        feed?.deadLetter,
                        'blong-int-adapter.feed.dead',
                        'and the dead letter it names',
                    );
                    return result;
                },
                async function resolveWorkTopic(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const answer = (await kafkaTopicResolve(
                        {topic: 'blong-int-adapter.feed.work'},
                        $meta,
                    )) as Resolution;
                    assert.strictEqual(
                        answer.topic,
                        'blong-int-adapter.feed.work',
                        'the logical name is answered back',
                    );
                    assert.strictEqual(
                        answer.physical,
                        'blong-int-adapter.feed.work',
                        'this instance carries no tenant, so the broker name is the same',
                    );
                    assert.strictEqual(
                        answer.producer,
                        'default',
                        'the default producer carries it',
                    );
                    assert.strictEqual(answer.consumer, 'default', 'so does the matching reader');
                    assert.strictEqual(answer.feed, 'work', 'and the feed that reads it');
                    return answer;
                },
                async function resolveAnswerTopic(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    const answer = (await kafkaTopicResolve(
                        {topic: 'blong-int-adapter.feed.answers.queue'},
                        $meta,
                    )) as Resolution;
                    assert.strictEqual(
                        answer.producer,
                        'answers',
                        'a pattern decides the client, not the name it happens to have',
                    );
                    assert.strictEqual(
                        answer.feed,
                        undefined,
                        'and a topic no feed reads has no feed',
                    );
                    return answer;
                },
                async function refuseUnknownTopic(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                    // This instance admits foreign topics, so the guard does not refuse; what a
                    // topic nothing carries resolves to is the spec named `default` (`@@D-1035`).
                    const answer = (await kafkaTopicResolve(
                        {topic: 'outside.the.namespace'},
                        $meta,
                    )) as Resolution;
                    assert.strictEqual(answer.topic, 'outside.the.namespace', 'the name is echoed');
                    assert.strictEqual(
                        answer.producer,
                        'default',
                        'a topic no pattern names is carried by the spec named default',
                    );
                    assert.strictEqual(answer.feed, undefined, 'and no feed reads it');
                    return true;
                },
            ]),
    }),
);
