import {test} from 'tap';

import {agentCallSettings, agentLanguageModel, agentProviderOf} from './agentProvider.ts';

/**
 * One account, any endpoint.
 *
 * `kind` says who drives the loop and `provider` says what the model answers in, so the same engine
 * reaches OpenAI, a laptop's Ollama, a router, or Anthropic's own API without a code change (`@@D-723`).
 * These assertions are that contract: what an account may leave out, what the settings become, and
 * what happens when a deployment carries one provider and not the other.
 */
test('every popular endpoint is one dialect and a base URL', t => {
    t.equal(agentProviderOf({kind: 'vercel'}), 'openai', 'nothing named: the compatible shape');
    t.equal(
        agentProviderOf({kind: 'vercel', baseUrl: 'http://localhost:11434/v1'}),
        'openai',
        'Ollama publishes the compatible shape, so it is not a provider of its own',
    );
    t.equal(
        agentProviderOf({kind: 'vercel', baseUrl: 'https://openrouter.ai/api/v1'}),
        'openai',
        'nor is a router, or a gateway-compatible base',
    );
    t.equal(
        agentProviderOf({kind: 'vercel', baseUrl: 'https://api.anthropic.com/v1'}),
        'anthropic',
        'a base URL that names a vendor decides',
    );
    t.equal(
        agentProviderOf({kind: 'vercel', modelName: 'claude-sonnet-4-5'}),
        'anthropic',
        'so does a model name nobody else uses',
    );
    t.equal(
        agentProviderOf({
            kind: 'vercel',
            provider: 'gateway',
            baseUrl: 'https://api.anthropic.com',
            modelName: 'claude',
        }),
        'gateway',
        'and an explicit provider wins over both inferences',
    );
    t.end();
});

test('the call settings are the SDK vocabulary, with parameters last', t => {
    t.same(agentCallSettings({kind: 'vercel'}), {}, 'an account that sets nothing sends nothing');

    t.same(
        agentCallSettings({
            kind: 'vercel',
            temperature: 0,
            maxOutputTokens: 256,
            reasoningEffort: 'high',
        }),
        {temperature: 0, maxOutputTokens: 256, reasoning: 'high'},
        'the shortcuts arrive under the names the SDK translates per provider',
    );

    t.same(
        agentCallSettings({
            kind: 'vercel',
            reasoningEffort: 'high',
            parameters: {reasoning: 'none', topP: 0.9},
        }),
        {reasoning: 'none', topP: 0.9},
        'and the escape hatch wins over the shortcut it overlaps',
    );
    t.end();
});

test('both native providers build a model, and the compatible one needs nothing else', async t => {
    // The three packages ship with the framework, so this is the whole reach of a configuration: the
    // same engine kind answers from an OpenAI-compatible endpoint, from Anthropic's own API, or
    // through a gateway, and only `baseUrl`/`apiKey`/`provider` change (`@@D-723`).
    t.ok(
        await agentLanguageModel({kind: 'vercel', provider: 'anthropic', apiKey: 'k'}),
        'anthropic builds its own model',
    );
    t.ok(
        await agentLanguageModel({kind: 'vercel', provider: 'gateway', apiKey: 'k'}),
        'and so does the gateway, which routes by `vendor/model`',
    );
    t.ok(
        await agentLanguageModel({
            kind: 'vercel',
            apiKey: 'k',
            baseUrl: 'http://localhost:11434/v1',
            modelName: 'qwen2.5-coder:14b',
        }),
        'while a compatible endpoint is reached with the OpenAI package alone',
    );
    t.end();
});
