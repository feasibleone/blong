import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {pickPromptId} from '../../../orchestrator/chat/agentChatReceive.ts';

/**
 * The persona seams, over the Slack simulator and its own database (`@@D-729`).
 *
 * What is asserted is the flow a person sees: a channel nobody has talked to is asked which persona it
 * wants, the answer becomes a binding the chat realm stores without reading (`@@D-725`), the next
 * message continues the same session, `/stats` reports it, and `/new` ends it so the message after that
 * opens another.
 *
 * The pick is an ordinary ask, so the answer is delivered through `chat.in.answer.receive` while the
 * receive call is parked on it — the same delivery the platform makes, and the same one `testAgentChat`
 * makes for a question the run asked.
 */
interface IReceiveResult {
    status?: string;
    sessionId?: string;
    personaKey?: string;
    message?: string;
}

export default handler(context => {
    const {group} = context.lib;
    const {agentChatReceive, chatChannelFind, chatInAnswerReceive, chatInMessageReceive} =
        context.handler;
    const $meta = {} as IMeta;
    /** A fresh conversation per run, so a binding left by an earlier run cannot answer this one. */
    const conversationId = `P${Date.now()}`;
    const where = {platform: 'slack' as const, account: 'demo', conversationId};
    let sessionId = '';

    /** The pick's id belongs to the channel, which is what lets a caller answer without asking. */
    const promptId = pickPromptId(where);

    const send = (text: string) =>
        agentChatReceive(
            {
                kind: 'message',
                platform: where.platform,
                account: where.account,
                conversationId,
                text,
            },
            $meta,
        ) as Promise<IReceiveResult>;

    return {
        testAgentPersona: ({name = 'agent persona'}: {name?: string} = {}) =>
            group(name)([
                async function aNewChannelIsAskedWhichPersona(assert: IAssert) {
                    const asking = send('hello');
                    let settled = false;
                    const watched = asking.then(
                        result => {
                            settled = true;
                            return result;
                        },
                        error => {
                            settled = true;
                            throw error;
                        },
                    );
                    for (let attempt = 0; attempt < 100 && !settled; attempt += 1) {
                        await chatInAnswerReceive({...where, promptId, value: 'chat'}, $meta);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    const answered = await watched;
                    assert.equal(answered.personaKey, 'chat', 'the picked persona answered');
                    assert.ok(answered.sessionId, 'the turn opened a session');
                    assert.ok(answered.message, 'the persona answered the message');
                    sessionId = String(answered.sessionId);
                },

                async function theNextMessageContinuesTheSameSession(assert: IAssert) {
                    const answered = await send('and again');
                    assert.equal(answered.status, 'answered', 'no second pick was asked for');
                    assert.equal(
                        String(answered.sessionId),
                        sessionId,
                        'the conversation continued its session',
                    );
                },

                async function statsReportTheConversation(assert: IAssert) {
                    const reported = await send('/stats');
                    assert.equal(reported.status, 'command', 'the command was handled, not run');
                    const text = String(reported.message ?? '');
                    assert.match(text, /Steps: \d+/, 'the step count is reported');
                    assert.match(text, /Session: /, 'and the session it belongs to');
                },

                async function newStartsAnotherSession(assert: IAssert) {
                    const closed = await send('/new');
                    assert.equal(closed.status, 'command', 'the command was handled');
                    const answered = await send('fresh start');
                    assert.ok(answered.sessionId, 'a session was opened');
                    assert.ok(String(answered.sessionId) !== sessionId, 'and it is a new one');
                },

                /**
                 * The path a platform takes, not the one beside it: a message enters through
                 * `chat.in.message.receive`, which looks the channel up, forwards it to the consumer its
                 * forward map names, and carries the pick back into the same conversation. Skipping this
                 * hop is what let a map keyed by platform instead of account pass a green suite and fail
                 * a real workspace (`@@F-666`).
                 */
                async function aMessageArrivesThroughTheChatRealm(assert: IAssert) {
                    const conversation = `Q${Date.now()}`;
                    const where2 = {
                        platform: 'slack' as const,
                        account: 'demo',
                        conversationId: conversation,
                    };
                    const entering = chatInMessageReceive(
                        {kind: 'message', ...where2, text: 'hello through the realm'},
                        $meta,
                    ) as Promise<{handled?: boolean}>;
                    const pickId = pickPromptId(where2);
                    let done = false;
                    const watched = entering.then(
                        value => {
                            done = true;
                            return value;
                        },
                        error => {
                            done = true;
                            throw error;
                        },
                    );
                    for (let attempt = 0; attempt < 100 && !done; attempt += 1) {
                        await chatInAnswerReceive(
                            {...where2, promptId: pickId, value: 'chat'},
                            $meta,
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    const entered = await watched;
                    assert.equal(entered.handled, true, 'the realm handled the message');
                    const stored = (await chatChannelFind(where2, $meta)) as {
                        channel?: Record<string, unknown>;
                    };
                    assert.equal(
                        stored.channel?.bindingKey,
                        'chat',
                        'and the channel kept the pick',
                    );
                },

                async function helpListsTheCommands(assert: IAssert) {
                    const listed = await send('/help');
                    assert.match(String(listed.message ?? ''), /\/new/, 'the commands are listed');
                },
            ]),
    };
});
