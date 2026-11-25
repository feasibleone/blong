import t from 'tap';

import {sessionHeaderMerge, sessionHeaderOf, sessionToolsOf} from './sessionMetrics.ts';
import {type ISessionEvent} from './sessionSections.ts';

/**
 * The header's cells, pinned against a scripted list (`@@T-800`).
 *
 * Every figure the page shows above the transcript is asserted here rather than in the browser: a
 * number that is wrong reads as a session that behaved differently from the one the person is
 * looking at.
 */

const events: ISessionEvent[] = [
    {seq: 0, kind: 'status', payload: {state: 'running'}, at: 1_000},
    {seq: 1, kind: 'message', payload: {text: '12345678'}, at: 1_100},
    {seq: 2, kind: 'tool', payload: {toolName: 'bash', toolCallId: 'c1'}, at: 2_000},
    {
        seq: 3,
        kind: 'tool-result',
        payload: {toolName: 'bash', toolCallId: 'c1', durationMs: 500},
        at: 2_500,
    },
    {seq: 4, kind: 'tool', payload: {toolName: 'edit', toolCallId: 'c2'}, at: 3_000},
    {
        seq: 5,
        kind: 'tool-result',
        payload: {toolName: 'edit', toolCallId: 'c2', durationMs: 250},
        at: 3_250,
    },
    {seq: 6, kind: 'message', payload: {text: '1234'}, at: 3_500},
];

t.test('each cell is what the events say', async t => {
    const header = sessionHeaderOf(events, {now: 4_000});
    t.equal(header.turns, 1, 'one call that opened is one turn');
    t.equal(header.tokensOut, 3, 'twelve characters of message are three tokens');
    t.equal(header.contextLength, 3, 'and the context is what was seen');
    t.equal(header.tools.length, 2, 'both tools are counted');
    t.equal(header.tools[0]?.name, 'bash', 'the busiest first');
    t.equal(header.toolTotalMs, 750, 'the tools took 750 ms together');
    t.equal(header.runningTool, undefined, 'nothing is running');
    t.equal(
        header.source,
        'settled',
        "no engine reported usage, so the numbers are the estimator's",
    );
});

t.test('a tool still out is timed against the moment the header draws', async t => {
    const header = sessionHeaderOf(events.slice(0, 5), {now: 9_000});
    t.equal(header.runningTool?.name, 'edit', 'the call with no result is the running one');
    t.equal(header.runningTool?.elapsedMs, 6_000, 'and it has been running for six seconds');
    t.equal(header.tools.length, 1, 'a finished tool is still counted');
});

t.test('an engine that reports usage is believed over the estimator', async t => {
    const header = sessionHeaderOf(
        [
            {seq: 0, kind: 'status', payload: {state: 'running', usage: {inputTokens: 1_200}}},
            {seq: 1, kind: 'message', payload: {text: '1234'}},
        ],
        {now: 0},
    );
    t.equal(header.tokensIn, 1_200, 'the reported input tokens are used');
    t.equal(header.tokensOut, 1, 'the message contributes its estimate');
    t.equal(header.contextLength, 1_201, 'and the context is the sum');
    t.equal(header.source, 'live', 'which is what makes the header live rather than settled');
});

t.test('the projection fills what the stream has not seen', async t => {
    const live = sessionHeaderOf(events.slice(0, 1), {now: 0});
    const merged = sessionHeaderMerge(
        {
            turnCount: 4,
            messageTokens: 900,
            toolCount: 2,
            tools: {bash: {count: 2, durationMs: 300}},
        },
        live,
    );
    t.equal(merged.turns, 4, 'the folded turn count survives a stream that only just opened');
    t.equal(merged.tokensOut, 900, 'and so does the folded token estimate');
    t.equal(merged.contextLength, 900, 'which the context follows');
    t.equal(
        merged.tools[0]?.name,
        'bash',
        "the projection's tools answer when the stream has none",
    );
    t.equal(merged.toolTotalMs, 300, 'with their total');
});

t.test('the tools column reads back as a list, JSON text or object', async t => {
    t.same(sessionToolsOf({bash: {count: 1, durationMs: 10}}), [
        {name: 'bash', count: 1, durationMs: 10},
    ]);
    t.same(
        sessionToolsOf('{"edit":{"count":2,"durationMs":20}}'),
        [{name: 'edit', count: 2, durationMs: 20}],
        'a JSON column read back as text still becomes a list',
    );
    t.same(sessionToolsOf(undefined), [], 'and an absent column is no tools');
});
