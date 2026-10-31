import type {IAgentScriptEntry, IAgentStepRequest} from '@feasibleone/blong/types';
import {test} from 'tap';

import {simCursor, simReset, simSession, simStep} from './agentSim.ts';

/**
 * The scripted engine kind, without a platform.
 *
 * It is the double every realm test stands on, so what it guarantees is worth asserting here: one
 * entry per turn, a call returned and never executed, a dialogue that ends in a stop rather than a
 * throw, and a cursor that a close really forgets (`@@D-708`).
 */
const script: IAgentScriptEntry[] = [
    {text: 'Reading the failing test.'},
    {
        text: 'Opening it.',
        toolCall: {toolName: 'readFile', args: {path: 'login.test.ts'}, toolCallId: 'c1'},
    },
    {text: 'Fixed the race.', finishReason: 'stop'},
];

const request = (account: string): IAgentStepRequest => ({
    account,
    instructions: 'You are a coding agent.',
    history: [{role: 'user', text: 'Fix it.'}],
    tools: [{toolName: 'readFile', toolDescription: 'Read a file', parameters: {}}],
});

test('sim.step replays one entry per turn', t => {
    const account = 'replay';
    simReset(account);
    t.equal(simCursor(account), 0, 'a fresh dialogue starts at the top');

    const first = simStep(script, account, request(account));
    t.equal(first.text, 'Reading the failing test.', 'the first entry is the first answer');
    t.same(first.toolCalls, [], 'a text entry calls nothing');
    t.equal(simCursor(account), 1, 'and the cursor moved');

    const second = simStep(script, account, request(account));
    t.equal(second.text, 'Opening it.', 'the second entry keeps its text');
    t.equal(second.toolCalls.length, 1, 'and carries the call it asks for');
    t.equal(second.toolCalls[0].toolName, 'readFile', 'the call is the tool the script named');
    t.same(second.toolCalls[0].args, {path: 'login.test.ts'}, 'with the arguments it carries');
    t.equal(second.finishReason, 'tool-calls', 'and says why it stopped');

    const third = simStep(script, account, request(account));
    t.equal(third.text, 'Fixed the race.', 'the last entry is the answer');
    t.equal(third.finishReason, 'stop', 'which ends the dialogue');

    simReset(account);
    t.equal(simCursor(account), 0, 'a close forgets the cursor');
    t.end();
});

test('sim.step ends a spent dialogue instead of failing', t => {
    const account = 'spent';
    simReset(account);
    simStep([{text: 'only'}], account, request(account));
    const extra = simStep([{text: 'only'}], account, request(account));
    t.equal(extra.toolCalls.length, 0, 'nothing is called');
    t.equal(extra.finishReason, 'stop', 'and the turn stops rather than throwing');
    simReset(account);
    t.end();
});

test('sim.session reports the whole script once', t => {
    const account = 'native';
    const run = simSession(script, account, {
        account,
        prompt: 'Fix it.',
        tools: [],
        workspacePath: '/tmp/ws',
    });
    t.equal(run.text, 'Fixed the race.', 'the answer is the last text in the script');
    t.equal(run.sessionKey, 'sim-native|/tmp/ws', 'the key is the account and its workspace');
    t.equal(run.events?.length, 3, 'every entry is reported as an event');
    t.equal(run.events?.[1].kind, 'tool', 'including the call, which the engine owns in this mode');
    t.equal(run.finishReason, 'stop', 'and the run reports why it ended');
    t.end();
});
