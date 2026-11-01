/**
 * One model, whichever wire format the account speaks.
 *
 * The engine kinds answer two different questions and used to conflate them: `kind` says **who drives
 * the loop** (`sim`, `vercel`, `mastra`, `deepseek`), while the account's `provider` says **what shape
 * the model answers in**. A deployment's model is therefore configuration rather than code — the same
 * `vercel` kind talks to OpenAI, to an Ollama on a laptop, to an OpenRouter route or to an
 * Anthropic-compatible base, and the change is `baseUrl`, `apiKey` and `provider` in the rc file
 * (`@@D-723`).
 *
 * The native providers are imported on demand, because each is a package a deployment may not carry:
 * a process with only OpenAI-compatible accounts never loads the Anthropic client, and an account
 * that names one of them without the package fails alone — the rule the engine kinds already follow
 * (`@@D-700`).
 */
import type {AgentEngineProvider, IAgentEngineAccount} from '@feasibleone/blong/types';

import {agentEngineKey} from './agentKey.ts';

/** The package a provider cannot work without, and the name to put in the error when it is absent. */
const PACKAGE: Record<AgentEngineProvider, string> = {
    openai: '@ai-sdk/openai',
    anthropic: '@ai-sdk/anthropic',
    gateway: '@ai-sdk/gateway',
};

/** What one provider is called and what it defaults to when the account names no model. */
const DEFAULTS: Record<AgentEngineProvider, {packageName: string; model: string}> = {
    openai: {packageName: PACKAGE.openai, model: 'gpt-4.1-mini'},
    anthropic: {packageName: PACKAGE.anthropic, model: 'claude-sonnet-4-5'},
    // A gateway routes by `vendor/model`, so its default names both halves.
    gateway: {packageName: PACKAGE.gateway, model: 'openai/gpt-4.1-mini'},
};

/**
 * The wire format an account speaks.
 *
 * An explicit `provider` wins. Otherwise the address and the model name are asked, in that order: a
 * base URL that names a vendor is the strongest signal a person meant, and a model name that starts
 * with `claude` or `gpt` says as much. Anything else is `openai`, because that is the shape a service
 * publishes when it publishes a compatible endpoint — including the ones that are not OpenAI.
 */
export const agentProviderOf = (account: IAgentEngineAccount): AgentEngineProvider => {
    if (account.provider) return account.provider;
    const url = (account.baseUrl ?? '').toLowerCase();
    const model = (account.modelName ?? '').toLowerCase();
    if (url.includes('anthropic') || model.startsWith('claude')) return 'anthropic';
    if (url.includes('gateway')) return 'gateway';
    return 'openai';
};

/**
 * A provider package, by name, or nothing when the deployment does not carry it.
 *
 * The specifier is computed so the compiler does not require the package to exist — the same device
 * `loadKind` uses — because a deployment may ship one provider and not the others.
 */
const loadProvider = async (name: string): Promise<Record<string, unknown> | null> => {
    try {
        return (await import(/* @vite-ignore */ name)) as Record<string, unknown>;
    } catch {
        return null;
    }
};

/** The error an account gets when its provider's package is not installed. */
const missing = (provider: AgentEngineProvider): never => {
    throw new Error(
        `provider ${provider} needs ${DEFAULTS[provider].packageName} — install it beside ai, or ` +
            'point this account at an OpenAI-compatible endpoint instead',
    );
};

/**
 * The model this account calls, loaded through its provider.
 *
 * Every provider factory takes the same three facts — key, base URL, headers — so an account needs no
 * code to reach a different service. `organization` and `project` are OpenAI's alone and are passed
 * only where the provider has them.
 */
export const agentLanguageModel = async (account: IAgentEngineAccount): Promise<unknown> => {
    const provider = agentProviderOf(account);
    const key = agentEngineKey(account);
    const shared = {
        ...(key && {apiKey: key}),
        ...(account.baseUrl && {baseURL: account.baseUrl}),
        ...(account.headers && {headers: account.headers}),
    };
    const modelName = account.modelName ?? DEFAULTS[provider].model;
    const packageName = DEFAULTS[provider].packageName;
    const loaded = (await loadProvider(packageName)) ?? missing(provider);
    if (provider === 'anthropic') {
        const {createAnthropic} = loaded as {
            createAnthropic: (config: typeof shared) => (model: string) => unknown;
        };
        return createAnthropic(shared)(modelName);
    }
    if (provider === 'gateway') {
        const {createGateway} = loaded as {
            createGateway: (config: typeof shared) => (model: string) => unknown;
        };
        return createGateway(shared)(modelName);
    }
    const {createOpenAI} = loaded as {
        createOpenAI: (
            config: typeof shared & {organization?: string; project?: string},
        ) => (model: string) => unknown;
    };
    return createOpenAI({
        ...shared,
        ...(account.organization && {organization: account.organization}),
        ...(account.project && {project: account.project}),
    })(modelName);
};

/**
 * The call settings an account asks for, in the AI SDK's own vocabulary.
 *
 * The typed fields are shortcuts for the three everybody sets, and `parameters` is everything else —
 * `topP`, `seed`, `stopSequences`, `providerOptions`, and any setting the SDK grows later. It is
 * merged **last**, so an account that writes `parameters.reasoning` keeps it over the
 * `reasoningEffort` shortcut: the escape hatch is an escape hatch.
 *
 * `reasoningEffort` reaches the SDK as `reasoning`, which is the neutral setting it translates per
 * provider — OpenAI-style effort or Anthropic's thinking budget — rather than a flag one vendor
 * understands and the rest ignore.
 */
export const agentCallSettings = (account: IAgentEngineAccount): Record<string, unknown> => ({
    ...(account.temperature !== undefined && {temperature: account.temperature}),
    ...(account.maxOutputTokens !== undefined && {maxOutputTokens: account.maxOutputTokens}),
    ...(account.reasoningEffort !== undefined && {reasoning: account.reasoningEffort}),
    ...(account.parameters ?? {}),
});
