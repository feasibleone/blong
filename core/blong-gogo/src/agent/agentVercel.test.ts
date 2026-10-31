import type {IAgentMessage} from '@feasibleone/blong/types';
import {test} from 'tap';

import {vercelMessages, vercelSalvage, vercelSplit, vercelTools} from './agentVercel.ts';

/**
 * The mapping between the neutral transcript and the AI SDK, without a model.
 *
 * This is the part a key cannot prove: that a replayed conversation reaches the vendor as the same
 * conversation, that a call and its result stay paired, and that a tool is declared without an
 * `execute` so the SDK reports the call instead of running it (`@@D-708`).
 */
const history: IAgentMessage[] = [
    {role: 'system', text: 'You are a coding agent.'},
    {role: 'user', text: 'Fix the flaky login test.'},
    {
        role: 'assistant',
        text: 'Opening it.',
        toolCalls: [{toolName: 'readFile', toolCallId: 'c1', args: {path: 'login.test.ts'}}],
    },
    {role: 'tool', toolName: 'readFile', toolCallId: 'c1', result: {content: 'await login()'}},
    {role: 'assistant', text: 'Fixed the race.'},
];

test('vercel.messages keep the conversation and the call pairing', t => {
    const messages = vercelMessages(history);
    t.equal(messages.length, 5, 'every turn is carried over');
    t.same(
        messages[0],
        {role: 'system', content: 'You are a coding agent.'},
        'a system turn stays text',
    );
    t.same(
        messages[1],
        {role: 'user', content: 'Fix the flaky login test.'},
        'a user turn stays text',
    );
    t.same(
        messages[2].content,
        [
            {type: 'text', text: 'Opening it.'},
            {
                type: 'tool-call',
                toolCallId: 'c1',
                toolName: 'readFile',
                input: {path: 'login.test.ts'},
            },
        ],
        'an assistant turn carries its words and its call, in that order',
    );
    t.same(
        messages[3].content,
        [
            {
                type: 'tool-result',
                toolCallId: 'c1',
                toolName: 'readFile',
                output: {type: 'json', value: {content: 'await login()'}},
            },
        ],
        'a tool turn is the result of the call it answers',
    );
    t.same(
        messages[4],
        {role: 'assistant', content: 'Fixed the race.'},
        'a plain answer stays text',
    );
    t.end();
});

test('vercel.messages name a call the transcript did not', t => {
    const messages = vercelMessages([
        {role: 'assistant', toolCalls: [{toolName: 'runCommand', args: {command: 'ls'}}]},
        {role: 'tool', toolName: 'runCommand', result: {stdout: 'src'}},
    ]);
    t.equal(
        (messages[0].content as Array<{toolCallId: string}>)[0].toolCallId,
        'runCommand',
        'a call without an id is identified by its tool',
    );
    t.equal(
        (messages[1].content as Array<{toolCallId: string}>)[0].toolCallId,
        'runCommand',
        'and its result uses the same identity',
    );
    t.end();
});

test('vercel.tools declare calls without executing them', async t => {
    const tools = await vercelTools([
        {
            toolName: 'readFile',
            toolDescription: 'Read a file in the ticket workspace',
            parameters: {type: 'object', properties: {path: {type: 'string'}}},
        },
    ]);
    const readFile = tools.readFile as {execute?: unknown; description?: string};
    t.ok(readFile, 'the tool is declared under its own name');
    t.equal(readFile.description, 'Read a file in the ticket workspace', 'with its description');
    t.equal(readFile.execute, undefined, 'and no execute, so the SDK returns the call');
    t.end();
});

test('the system turn is split out of the messages', async t => {
    const split = vercelSplit([
        {role: 'system', text: 'You are a coding agent.'},
        {role: 'user', text: 'Work the ticket.'},
    ]);
    t.equal(split.instructions, 'You are a coding agent.', 'the system turn becomes instructions');
    t.same(split.messages.map(m => m.role), ['user'], 'and the messages carry only the rest');
});

test('a tool call written as text is salvaged, and an unknown one is not', async t => {
    const tools = [{toolName: 'writeFile', toolDescription: 'w', parameters: {}}];
    const salvaged = vercelSalvage(
        'Sure:\n```json\n{"name": "writeFile", "arguments": {"path": "DONE.txt"}}\n```',
        tools,
    );
    t.equal(salvaged?.toolName, 'writeFile', 'the call the model wrote is read back');
    t.same(salvaged?.args, {path: 'DONE.txt'}, 'with the arguments it wrote');
    t.equal(
        vercelSalvage('{"name": "dropTable", "arguments": {}}', tools),
        undefined,
        'a name the caller did not declare is ignored',
    );
    t.equal(vercelSalvage('Nothing to do.', tools), undefined, 'and prose is prose');
});
