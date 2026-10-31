import type {IAgentEngineAccount} from '@feasibleone/blong/types';
import {test} from 'tap';

import {deepseekClose, deepseekOptions} from './agentDeepseek.ts';

/**
 * The launch spec a DeepSeek session is spawned with, without spawning anything.
 *
 * What a key cannot prove is asserted here: that the ticket's workspace becomes the runtime's `cwd`,
 * that the binary and its home are deployment configuration rather than a lookup, and that a close on
 * an account nothing opened is a no-op (`@@D-711`).
 */
const account: IAgentEngineAccount = {
    kind: 'deepseek',
    modelName: 'deepseek-v4-flash',
    dshBin: '/opt/dsh/bin/dsh',
    dshHome: '/var/lib/dsh',
    maxOutputTokens: 1024,
    mode: 'native',
};

test('deepseek.options put the ticket workspace in front of the runtime', t => {
    const options = deepseekOptions(account, {
        account: 'dsh',
        prompt: 'Fix the flaky test.',
        tools: [],
        workspacePath: '/var/lib/blong-agent/workspace/T-1001',
    });
    t.equal(
        options.cwd,
        '/var/lib/blong-agent/workspace/T-1001',
        'the runtime works in the ticket directory',
    );
    t.equal(options.model, 'deepseek-v4-flash', 'the model comes from the account');
    t.equal(options.maxTokens, 1024, 'and so does the output cap');
    t.same(
        options.launch,
        {dshBin: '/opt/dsh/bin/dsh', dshHome: '/var/lib/dsh'},
        'the binary and its home are configuration, not a lookup',
    );
    t.end();
});

test('deepseek.options omit what the account did not configure', t => {
    const options = deepseekOptions({kind: 'deepseek'}, {account: 'dsh', prompt: 'hi', tools: []});
    t.same(options.launch, {}, 'no launch spec is invented');
    t.notOk('cwd' in options, 'a request without a workspace sets no directory');
    t.notOk('model' in options, 'and no model is guessed');
    t.end();
});

test('deepseek.close on an account nothing opened is harmless', t => {
    t.doesNotThrow(
        () => deepseekClose(account, '/nowhere'),
        'a close for a runtime that was never spawned does nothing',
    );
    t.end();
});
