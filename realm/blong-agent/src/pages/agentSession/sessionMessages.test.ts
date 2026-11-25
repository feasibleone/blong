import t from 'tap';

import {sessionMessagesOf} from './sessionMessages.ts';
import {type ISessionEvent, sessionSectionsOf} from './sessionSections.ts';
import {sessionRowsOf} from './toolGrouping.ts';

/**
 * The seam a chat-view migration would sit on (`@@T-814`).
 *
 * Every kind the reducer can emit is in one stream here, so the test is the round trip: the messages a
 * chat view would be handed describe the same transcript the page draws — nothing dropped, nothing
 * invented, and one message per turn of the model.
 */

const event = (
    seq: number,
    kind: ISessionEvent['kind'],
    payload: Record<string, unknown>,
): ISessionEvent => ({seq, kind, payload, at: 1_000 + seq * 100});

const stream: ISessionEvent[] = [
    event(0, 'status', {state: 'running', mode: 'native'}),
    event(1, 'reasoning', {text: 'Read the ticket first.'}),
    event(2, 'message', {text: 'I will look at the workspace.'}),
    event(3, 'tool', {toolName: 'bash', toolCallId: 'c1', arguments: {command: 'ls'}}),
    event(4, 'tool-result', {
        toolCallId: 'c1',
        toolName: 'bash',
        durationMs: 40,
        shellExecution: {exitCode: 0},
        result: {content: 'a.md'},
    }),
    event(5, 'message', {text: 'One file.'}),
    event(6, 'tool', {
        toolName: 'create',
        toolCallId: 'c2',
        arguments: {path: 'b.md', file_text: 'x'},
    }),
    event(7, 'tool-result', {toolCallId: 'c2', toolName: 'create', success: true}),
    event(8, 'tool', {toolName: 'view', toolCallId: 'c3', arguments: {path: 'b.md'}}),
    event(9, 'tool-result', {
        toolCallId: 'c3',
        toolName: 'view',
        success: true,
        result: {content: 'x'},
    }),
    event(10, 'status', {state: 'awaiting', question: 'Shall I apply it?'}),
    event(11, 'finished', {ok: true}),
];

const rows = sessionRowsOf(sessionSectionsOf(stream));

t.test('every kind the reducer emits becomes a chat message', async t => {
    const messages = sessionMessagesOf(rows);
    t.same(
        messages.map(message => message.role),
        [
            'activity',
            'reasoning',
            'assistant',
            'assistant',
            'assistant',
            'assistant',
            'activity',
            'activity',
        ],
        'a state, the thinking, the answer, a lone call, the answer, a run of calls, a question, an unmodelled event',
    );
    t.equal(messages[0]?.title, 'running', 'an activity carries the state it reports');
    t.equal(messages[1]?.content, 'Read the ticket first.', 'reasoning keeps its text');
    t.equal(messages[2]?.content, 'I will look at the workspace.', 'and an answer its own');
    t.equal(messages[3]?.toolCalls?.length, 1, 'a lone call is one message with one call');
    t.equal(messages[5]?.toolCalls?.length, 2, 'a run is one message with several');
    t.same(
        messages[5]?.toolCalls?.map(call => call.name),
        ['create', 'view'],
        'in the order the model made them',
    );
    t.equal(messages[5]?.toolCalls?.[0]?.detail?.path, 'b.md', 'and each call keeps its detail');
    t.equal(messages[5]?.toolCalls?.[0]?.durationMs, undefined, 'a call with no time claims none');
    t.equal(messages[3]?.toolCalls?.[0]?.durationMs, 40, 'a call that reported one keeps it');
    t.equal(messages[3]?.toolCalls?.[0]?.detail?.exitCode, 0, 'a shell keeps its exit code');
    t.equal(messages[6]?.title, 'awaiting', 'a question is an activity with its own title');
    t.equal(messages[7]?.title, 'finished', 'and so is a kind the page does not model');
    t.equal(
        messages.filter(message => message.pending === true).length,
        0,
        'and all of it is settled',
    );
});

t.test('the ticket opens the list as the user turn the reference draws', async t => {
    const messages = sessionMessagesOf(rows, 'Fix the flaky login test');
    t.equal(messages[0]?.role, 'user', 'the ticket is the first message');
    t.equal(messages[0]?.content, 'Fix the flaky login test', 'with the ticket text');
    t.equal(messages[1]?.role, 'activity', 'and the transcript follows it');
    t.same(sessionMessagesOf([], '').length, 0, 'no ticket, no user turn');
});

t.test('a call still running is pending, so a view can draw its cursor', async t => {
    const running = sessionRowsOf(
        sessionSectionsOf([event(0, 'tool', {toolName: 'bash', toolCallId: 'c9', arguments: {}})]),
    );
    const [message] = sessionMessagesOf(running);
    t.equal(message?.role, 'assistant', 'a call in flight is still the assistant asking for it');
    t.equal(message?.pending, true, 'and the message says it is not finished');
    t.equal(message?.toolCalls?.[0]?.done, false, 'as does the call');
});

t.test(
    'an id is a section key, so two reductions of one stream name the same messages',
    async t => {
        const once = sessionMessagesOf(rows);
        const twice = sessionMessagesOf(sessionRowsOf(sessionSectionsOf(stream)));
        t.same(
            once.map(message => message.id),
            twice.map(message => message.id),
            'React keys do not churn between two readings of one transcript',
        );
    },
);
