import type {IAgentMessage} from '@feasibleone/blong/types';
import {test} from 'tap';

import {mastraPrompt, mastraToolCalls} from './agentMastra.ts';

/**
 * The two parts of the Mastra adapter a model cannot be asked about: how a replayed conversation
 * reaches its prompt, and how a call is read back out of a result.
 *
 * The prompt rendering is the one lossy step in any step engine (`@@D-708`); the call mapping accepts
 * both shapes Mastra has published, because which one comes back is a version detail rather than a
 * contract.
 */
const history: IAgentMessage[] = [
    {role: 'system', text: 'You are a coding agent.'},
    {role: 'user', text: 'Fix the flaky login test.'},
    {role: 'assistant', toolCalls: [{toolName: 'readFile', args: {path: 'a.ts'}}]},
    {role: 'tool', toolName: 'readFile', result: {content: 'x'}},
    {role: 'assistant', text: 'Fixed the race.'},
];

test('mastra.prompt renders the conversation it was given', t => {
    const prompt = mastraPrompt(history);
    t.equal(
        prompt,
        'user: Fix the flaky login test.\nassistant: (no text)\nassistant: Fixed the race.',
        'the system turn is the instructions, and a tool turn is not replayed as text',
    );
    t.end();
});

test('mastra.calls read the flat shape', t => {
    const calls = mastraToolCalls({
        toolCalls: [{toolName: 'readFile', toolCallId: 'c1', args: {path: 'a.ts'}}],
    });
    t.same(
        calls,
        [{toolName: 'readFile', toolCallId: 'c1', args: {path: 'a.ts'}}],
        'a flat call is carried as it arrived',
    );
    t.end();
});

test('mastra.calls read the payload-nested shape', t => {
    const calls = mastraToolCalls({
        toolCalls: [{payload: {toolName: 'runCommand', args: {command: 'ls'}}}],
    });
    t.same(calls, [{toolName: 'runCommand', args: {command: 'ls'}}], 'a nested call is unwrapped');
    t.end();
});

test('mastra.calls answer nothing when there is nothing', t => {
    t.same(mastraToolCalls({}), [], 'a result with no calls is no calls');
    t.same(mastraToolCalls(undefined), [], 'and so is no result at all');
    t.end();
});
