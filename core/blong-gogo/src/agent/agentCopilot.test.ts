import type {IAgentEngineAccount, IAgentSessionRequest} from '@feasibleone/blong/types';
import type {CopilotClient, CopilotSession} from '@microsoft/copilot-sdk';
import {test} from 'tap';

import {
    COPILOT_SHELL_TOOLS,
    COPILOT_TOOL_NAMES,
    copilotEndpoint,
    copilotPermissionFor,
    copilotSession,
    copilotSessionConfig,
    copilotToolOf,
    type CopilotSdk,
} from './agentCopilot.ts';

/**
 * The Copilot kind without a runtime: the spec it sends, the tools it registers and the policy it
 * applies, asserted against stand-ins for the SDK and the client (`@@D-970` .. `@@D-975`).
 *
 * What a real runtime would prove and this cannot is the wire; what this proves and a runtime would
 * hide is that the provider block carries BYOK rather than a Copilot login, that only the two tools
 * the realm can bridge are registered, and that a parked question comes back as `suspended` instead
 * of a finished run (`@@D-976`).
 */
const account: IAgentEngineAccount = {
    kind: 'copilot',
    runtimeUrl: '10.0.1.10:4321',
    runtimeTokenEnv: 'COPILOT_CONNECTION_TOKEN',
    workspaceRoot: '/srv/blong-agent/workspaces',
    modelName: 'deepseek-flash',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'AGENT_ENGINE_API_KEY',
};

const request = (overrides: Partial<IAgentSessionRequest> = {}): IAgentSessionRequest => ({
    account: 'srv1',
    prompt: 'Work the ticket.',
    instructions: 'Keep the change small.',
    workspacePath: '/srv/blong-agent/workspaces/T-1001',
    allowShell: true,
    tools: [
        {
            toolName: 'askHuman',
            toolDescription: 'Ask the person who opened the ticket.',
            parameters: {type: 'object', properties: {question: {type: 'string'}}},
        },
        {
            toolName: 'finish',
            toolDescription: 'Stop and report.',
            parameters: {type: 'object', properties: {summary: {type: 'string'}}},
        },
        {
            toolName: 'writeFile',
            toolDescription: 'Write a file.',
            parameters: {type: 'object', properties: {}},
        },
    ],
    toolDispatch: {method: 'agent.tool.run', ticketId: 'T-1001', sessionId: 's-1'},
    ...overrides,
});

type StubSession = CopilotSession & {
    emitted: (type: string, event: unknown) => void;
    aborted: boolean;
};

const stubSession = (content = 'done', onSend?: () => Promise<void>): StubSession => {
    const handlers: Record<string, Array<(event: unknown) => void>> = {};
    const session = {
        sessionId: 's-1',
        aborted: false,
        on: (type: string, handler: (event: unknown) => void) => {
            (handlers[type] ??= []).push(handler);
            return () => undefined;
        },
        abort: async () => {
            session.aborted = true;
        },
        disconnect: async () => undefined,
        sendAndWait: async () => {
            await onSend?.();
            return {data: {content}};
        },
        emitted: (type: string, event: unknown) =>
            (handlers[type] ?? []).forEach(handler => handler(event)),
    };
    return session as unknown as StubSession;
};

const stubSdk = (): CopilotSdk =>
    ({
        defineTool: (name: string, config: Record<string, unknown>) => ({name, ...config}),
        RuntimeConnection: {forTcp: () => ({})},
        CopilotClient: class {} as unknown as CopilotSdk['CopilotClient'],
    }) as CopilotSdk;

test('copilot.endpoint reads host:port and refuses anything else', t => {
    t.same(copilotEndpoint('10.0.1.10:4321'), {host: '10.0.1.10', port: 4321}, 'plain host:port');
    t.same(
        copilotEndpoint('http://10.0.1.11:4321'),
        {host: '10.0.1.11', port: 4321},
        'a scheme written out of habit is tolerated',
    );
    t.throws(() => copilotEndpoint('10.0.1.10'), /host:port/, 'a bare host is not an endpoint');
    t.end();
});

test('copilot.config routes inference through BYOK and carries the run', t => {
    const previous = process.env.AGENT_ENGINE_API_KEY;
    process.env.AGENT_ENGINE_API_KEY = 'sk-deepseek';
    try {
        const config = copilotSessionConfig(account, request());
        t.same(config.github, {capi: {enabled: false}}, 'Copilot inference is off');
        t.equal(config.model, 'deepseek-flash', 'the model comes from the account');
        t.same(
            config.inference,
            {
                defaultProvider: 'byok',
                providers: [
                    {
                        name: 'byok',
                        type: 'openai',
                        baseUrl: 'https://api.deepseek.com/v1',
                        apiKey: 'sk-deepseek',
                        wireApi: 'completions',
                    },
                ],
            },
            'DeepSeek is one OpenAI-compatible provider and the key is read from the variable',
        );
        t.same(
            config.systemMessage,
            {mode: 'append', content: 'Keep the change small.'},
            'the ticket instructions are appended to the harness prompt',
        );
        t.equal(
            config.workingDirectory,
            '/srv/blong-agent/workspaces/T-1001',
            'the session works in the ticket directory on the runtime host',
        );
        t.notOk(
            'reasoningEffort' in (config.inference as Record<string, unknown>),
            'a BYOK model is not asked to reason',
        );
    } finally {
        if (previous === undefined) delete process.env.AGENT_ENGINE_API_KEY;
        else process.env.AGENT_ENGINE_API_KEY = previous;
    }
    t.end();
});

test('copilot.config omits what the account did not configure', t => {
    const config = copilotSessionConfig({kind: 'copilot'}, {});
    t.notOk('model' in config, 'no model is invented');
    t.notOk('systemMessage' in config, 'no instruction block is invented');
    t.notOk('workingDirectory' in config, 'and no directory is guessed');
    t.same(
        (config.inference as {providers: Array<{baseUrl: string}>}).providers[0].baseUrl,
        'https://api.openai.com/v1',
        'the provider base falls back to OpenAI',
    );
    t.end();
});

test('copilot.config refuses a base URL whose wire the account did not name', t => {
    t.throws(
        () => copilotSessionConfig({...account, baseUrl: 'https://api.deepseek.com/anthropic'}, {}),
        /Anthropic wire/,
        'the Anthropic path with the default OpenAI shape is a configuration mistake, not a 404',
    );
    const named = copilotSessionConfig(
        {...account, provider: 'anthropic', baseUrl: 'https://api.deepseek.com/anthropic'},
        {},
    );
    t.equal(
        (named.inference as {providers: Array<{type: string}>}).providers[0].type,
        'anthropic',
        'naming the wire is what makes it legal',
    );
    t.end();
});

test('copilot.tools bridge only what the realm can serve', async t => {
    const dispatched: unknown[] = [];
    let parked: string | undefined;
    const sdk = stubSdk();
    const definition = request().tools[0];
    const tool = copilotToolOf(
        sdk,
        definition,
        async call => {
            dispatched.push(call);
            return {result: {answerText: 'the second one'}};
        },
        promptId => {
            parked = promptId;
        },
    ) as unknown as {name: string; handler: (args: unknown) => Promise<unknown>};
    t.equal(tool.name, 'askHuman', 'the tool keeps the realm name');
    const result = await tool.handler({question: 'Which fix?'});
    t.same(
        dispatched,
        [{toolName: 'askHuman', args: {question: 'Which fix?'}}],
        'the call reaches the realm unchanged',
    );
    t.same(result, {answerText: 'the second one'}, 'and the answer is the tool result');
    t.notOk(parked, 'an answered question parks nothing');

    const suspending = copilotToolOf(
        sdk,
        definition,
        async () => ({result: {suspended: true, promptId: 'p-1'}}),
        promptId => {
            parked = promptId;
        },
    ) as unknown as {handler: (args: unknown) => Promise<unknown>};
    const answer = (await suspending.handler({question: 'Which fix?'})) as {
        resultType?: string;
        textResultForLlm?: string;
    };
    t.equal(parked, 'p-1', 'an unanswered question parks the session with its prompt id');
    t.equal(answer.resultType, 'failure', 'and tells the model the call did not complete');
    t.match(String(answer.textResultForLlm), /parked/, 'in words the harness can read');
    t.end();
});

test('copilot.permissions apply the deployment command switch', t => {
    t.same(
        copilotPermissionFor(false)({kind: 'shell'}),
        {
            kind: 'reject',
            feedback: 'Running commands is disabled for this deployment.',
        },
        'a shell call is refused when the switch is off',
    );
    t.same(
        copilotPermissionFor(false)({kind: 'write'}),
        {kind: 'approve-once'},
        'editing still works',
    );
    t.same(
        copilotPermissionFor(true)({kind: 'shell'}),
        {kind: 'approve-once'},
        'and is approved when on',
    );
    t.same(
        copilotPermissionFor(undefined)({kind: 'shell'}),
        {kind: 'approve-once'},
        'unset means on',
    );
    t.end();
});

test('copilot.session creates a BYOK session and reports what it said', async t => {
    const session = stubSession('Wrote NOTES.md.');
    let created: Record<string, unknown> | undefined;
    const client = {
        createSession: async (config: Record<string, unknown>) => {
            created = config;
            return session;
        },
        resumeSession: async () => session,
    } as unknown as CopilotClient;
    const result = await copilotSession(account, request(), async () => ({result: {}}), {
        sdk: stubSdk(),
        client,
    });
    t.equal(result.sessionKey, 's-1', 'the runtime session id is what a resume names');
    t.equal(result.text, 'Wrote NOTES.md.', 'the final message is the summary');
    t.equal(result.finishReason, 'idle', 'and the run finished');
    t.notOk(result.suspended, 'nothing parked');
    const definitions = (created?.tools as {definitions: Array<{name: string}>}).definitions;
    t.same(
        definitions.map(definition => definition.name),
        [...COPILOT_TOOL_NAMES],
        'only the two tools the realm can bridge are registered',
    );
    t.same(
        (created?.permissions as {onRequest: (permission: unknown) => unknown}).onRequest({
            kind: 'shell',
        }),
        {kind: 'approve-once'},
        'the command switch is the deployment’s',
    );
    t.equal(
        (created?.filesystem as {trustWorkingDirectory?: string}).trustWorkingDirectory,
        'session',
        'the ticket directory is trusted for this session only',
    );
    t.end();
});

test('copilot.session drops the shell tool when the deployment says so', async t => {
    const created = async (allowShell: boolean): Promise<Record<string, unknown>> => {
        let config: Record<string, unknown> = {};
        const client = {
            createSession: async (options: Record<string, unknown>) => {
                config = options;
                return stubSession();
            },
            resumeSession: async () => stubSession(),
        } as unknown as CopilotClient;
        await copilotSession(account, request({allowShell}), async () => ({result: {}}), {
            sdk: stubSdk(),
            client,
        });
        return config;
    };
    const off = await created(false);
    t.same(
        (off.tools as {excludedTools?: string[]}).excludedTools,
        [...COPILOT_SHELL_TOOLS],
        'a deployment that forbids commands excludes the runtime shell tools',
    );
    const on = await created(true);
    t.notOk(
        (on.tools as {excludedTools?: string[]}).excludedTools,
        'and offers them when it allows them',
    );
    t.end();
});

test('copilot.session resumes by session id and delivers a parked question', async t => {
    let definitions: Array<{name: string; handler: (args: unknown) => Promise<unknown>}> = [];
    // The question is asked during the turn, which is what parks the session.
    const session = stubSession('The answer was applied.', async () => {
        const ask = definitions.find(definition => definition.name === 'askHuman');
        await ask?.handler({question: 'Which fix?'});
    });
    let resumed: {id?: string; config?: Record<string, unknown>} = {};
    const client = {
        createSession: async () => session,
        resumeSession: async (id: string, config: Record<string, unknown>) => {
            resumed = {id, config};
            definitions = (config.tools as {definitions: typeof definitions}).definitions;
            return session;
        },
    } as unknown as CopilotClient;
    const result = await copilotSession(
        account,
        request({sessionKey: 's-1'}),
        async () => ({result: {suspended: true, promptId: 'p-7'}}),
        {sdk: stubSdk(), client},
    );
    t.equal(resumed.id, 's-1', 'a resume names the runtime session');
    t.equal(result.suspended?.promptId, 'p-7', 'a parked question is reported as a suspension');
    t.equal(result.finishReason, 'suspended', 'and the run did not finish');
    t.equal(result.sessionKey, 's-1', 'the session id is kept for the next resume');
    t.end();
});

test('copilot.session refuses an account without a model', async t => {
    await t.rejects(
        copilotSession({kind: 'copilot'}, request(), async () => ({result: {}}), {
            sdk: stubSdk(),
            client: {} as CopilotClient,
        }),
        /needs modelName/,
        'BYOK requires a model and the account did not name one',
    );
    t.end();
});
