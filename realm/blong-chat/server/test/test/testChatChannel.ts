import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {simRequests, simReset} from '../../../simRecord.ts';

/**
 * `test.chat.channel` — a channel of its own, the way a plan opens one.
 *
 * Every other path in this realm starts from a message a person sent. This one starts from nothing:
 * three Slack calls in the order Slack requires them, a row written once all three succeeded, and an
 * answer that carries the id a caller stores (`@@D-805`). The simulator records each request, so the
 * assertion is about what the platform was actually asked to do.
 */
interface IBody {
    channel?: string;
    name?: string;
    is_private?: boolean;
    topic?: string;
    purpose?: string;
    users?: string;
}

export default handler(({lib: {group}, handler}) => {
    const call = (name: string, params: unknown, $meta: IMeta): Promise<unknown> =>
        (
            handler as unknown as Record<
                string,
                (params: unknown, $meta: IMeta) => Promise<unknown>
            >
        )[name](params, $meta);

    return {
        testChatChannel: ({name = 'chat channel'}: {name?: string} = {}) =>
            group(name)([
                async function aChannelIsCreatedWithATopicAndMembers(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const channelName = 'plan-ch-test';
                    const created = (await call(
                        'chatChannelCreate',
                        {
                            platform: 'slack',
                            account: 'demo',
                            channelName,
                            title: 'A test plan',
                            invite: ['U1', 'U2'],
                        },
                        $meta,
                    )) as {
                        channel?: {conversationId?: string; channelName?: string; topic?: string};
                    };
                    const conversationId = created.channel?.conversationId;
                    assert.equal(conversationId, 'C-plan', 'the id the platform answered is kept');
                    assert.equal(created.channel?.channelName, channelName, 'under the name asked for');
                    assert.equal(
                        created.channel?.topic,
                        'Plan: A test plan',
                        'the title becomes the topic when none is given',
                    );

                    const requests = simRequests('slack');
                    const create = requests.find(entry => entry.path.endsWith('conversations.create'));
                    assert.ok(create, 'the channel was created');
                    assert.equal(
                        (create?.body as IBody | undefined)?.name,
                        channelName,
                        'with the caller’s name',
                    );
                    assert.equal(
                        (create?.body as IBody | undefined)?.is_private,
                        true,
                        'private by default, because unfinished work is not an announcement',
                    );
                    const topic = requests.find(entry => entry.path.endsWith('conversations.setTopic'));
                    assert.equal(
                        (topic?.body as IBody | undefined)?.topic,
                        'Plan: A test plan',
                        'the topic carries the plan',
                    );
                    const purpose = requests.find(entry =>
                        entry.path.endsWith('conversations.setPurpose'),
                    );
                    assert.equal(
                        (purpose?.body as IBody | undefined)?.purpose,
                        'A test plan',
                        'and the readable title reaches the channel that the lowercase name cannot hold',
                    );
                    const invite = requests.find(entry => entry.path.endsWith('conversations.invite'));
                    assert.equal(
                        (invite?.body as IBody | undefined)?.users,
                        'U1,U2',
                        'and the people are added in the platform’s one-string form',
                    );

                    try {
                        const found = (await call(
                            'chatChannelFind',
                            {platform: 'slack', account: 'demo', conversationId},
                            $meta,
                        )) as {channel?: {conversationTitle?: string}};
                        assert.equal(
                            found.channel?.conversationTitle,
                            channelName,
                            'the realm remembers the channel it opened',
                        );
                    } finally {
                        const row = (await call(
                            'chatChannelFind',
                            {platform: 'slack', account: 'demo', conversationId},
                            $meta,
                        )) as {channel?: {channelId?: string}};
                        const channelId = row.channel?.channelId;
                        if (channelId) await call('chatChannelRemove', {channelId}, $meta);
                    }
                },

                async function aPlatformThatCannotOpenAChannelIsRefused(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    let refused: unknown;
                    try {
                        await call(
                            'chatChannelCreate',
                            {platform: 'viber', account: 'demo', channelName: 'plan-viber'},
                            $meta,
                        );
                    } catch (error) {
                        refused = error;
                    }
                    // The dispatch answers a failed leg as a tuple whose first element is the typed
                    // error, so the name is read from whichever shape arrived.
                    const first = (
                        Array.isArray(refused) ? refused[0] : refused
                    ) as {name?: string} | undefined;
                    assert.equal(
                        first?.name,
                        'chat.platformUnsupported',
                        'a channel is a capability, and Viber does not have it',
                    );
                },

                async function theTopicCanBeSetAgainOnAChannelThatExists(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    // A plan opens its channel before its issue exists often enough that the topic
                    // has to be repairable: the create is spent, the id is stored, and this is the
                    // call that puts the link in the header (`@@D-812`).
                    const topic = 'https://github.com/o/r/issues/7 · Plan: A test plan';
                    const answer = (await call(
                        'chatChannelTopic',
                        {platform: 'slack', account: 'demo', conversationId: 'C-plan', topic},
                        $meta,
                    )) as {conversationId?: string; topic?: string};
                    assert.equal(answer.conversationId, 'C-plan', 'the channel it was given');
                    assert.equal(answer.topic, topic, 'and the topic it set');

                    const requests = simRequests('slack');
                    const setTopic = requests.find(entry =>
                        entry.path.endsWith('conversations.setTopic'),
                    );
                    assert.equal(
                        (setTopic?.body as IBody | undefined)?.topic,
                        topic,
                        'the platform was asked for that topic',
                    );
                    assert.equal(
                        (setTopic?.body as {channel?: string} | undefined)?.channel,
                        'C-plan',
                        'on the conversation the caller stored',
                    );
                    assert.ok(
                        !requests.some(entry => entry.path.endsWith('conversations.create')),
                        'and nothing was created — the name is used up',
                    );
                },
            ]),
    };
});
