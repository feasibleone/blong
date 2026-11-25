import {test} from 'tap';

import {agentMetricProject, EMPTY_METRIC} from './agentMetricProject.ts';

/**
 * What a session's feed adds up to (`T-791`).
 *
 * The four numbers a list and a header show are folded here without a broker or a table: turns from
 * the `status` event that opens a call, tokens estimated from the message deltas, tool calls and
 * their durations from the results, and the last time anything happened.
 */
const at = (seq: number): number => 1_700_000_000_000 + seq;

test('a batch folds into turns, tokens, tools and the last event', t => {
    const metric = agentMetricProject(undefined, [
        {sessionId: 's-1', seq: 0, kind: 'status', payload: {state: 'running'}, at: at(0)},
        {
            sessionId: 's-1',
            seq: 1,
            kind: 'reasoning',
            payload: {text: 'thinking about it'},
            at: at(1),
        },
        {sessionId: 's-1', seq: 2, kind: 'message', payload: {text: '0123456789'}, at: at(2)},
        {sessionId: 's-1', seq: 3, kind: 'tool', payload: {toolName: 'bash'}, at: at(3)},
        {
            sessionId: 's-1',
            seq: 4,
            kind: 'tool-result',
            payload: {toolName: 'bash', durationMs: 250},
            at: at(4),
        },
        {sessionId: 's-1', seq: 5, kind: 'status', payload: {state: 'finished'}, at: at(5)},
    ]);
    t.equal(metric.turnCount, 1, 'a call that opened is one turn');
    t.equal(metric.messageTokens, 3, 'ten characters of a message are three tokens');
    t.same(
        metric.tools,
        {bash: {count: 1, durationMs: 250}},
        'a tool result is counted with the time it took',
    );
    t.equal(metric.toolCount, 1, 'and the total counts it once');
    t.equal(metric.lastEventAt, at(5), 'the last thing that happened is kept');
    t.end();
});

test('a second batch folds onto the first', t => {
    const first = agentMetricProject(undefined, [
        {sessionId: 's-1', seq: 0, kind: 'status', payload: {state: 'running'}, at: at(0)},
        {
            sessionId: 's-1',
            seq: 1,
            kind: 'tool-result',
            payload: {toolName: 'bash', durationMs: 100},
            at: at(1),
        },
    ]);
    const second = agentMetricProject(first, [
        {sessionId: 's-1', seq: 2, kind: 'status', payload: {state: 'running'}, at: at(2)},
        {
            sessionId: 's-1',
            seq: 3,
            kind: 'tool-result',
            payload: {toolName: 'bash', durationMs: 400},
            at: at(3),
        },
    ]);
    t.equal(second.turnCount, 2, 'two calls are two turns');
    t.same(
        second.tools.bash,
        {count: 2, durationMs: 500},
        'the same tool folds into one entry with its times added',
    );
    t.notOk(second.lastEventAt < first.lastEventAt, 'time never runs backwards');
    t.end();
});

test('an empty batch changes nothing, and an empty metric is zero everywhere', t => {
    const empty = agentMetricProject(undefined, []);
    t.same(empty, EMPTY_METRIC, 'nothing to fold leaves the empty summary');
    const kept = agentMetricProject(
        {turnCount: 2, messageTokens: 8, toolCount: 1, tools: {}, lastEventAt: at(9)},
        [],
    );
    t.equal(kept.turnCount, 2, 'and what was there is still there');
    t.end();
});
