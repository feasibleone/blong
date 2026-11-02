import {createHash, randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatChannel, IChatInbound} from '@feasibleone/blong/types';

import {agentSettings, type IAgentDispatchPort, type IAgentDispatchSettings} from '../settings.ts';
import {agentHistory} from '../tools.ts';

/**
 * `agent.chat.receive` — one message from a conversation, answered by a persona.
 *
 * This is the consumer `blong-chat` forwards to. The message arrives with the channel row the chat
 * realm keeps, and what that row binds is the only thing that decides who answers: a channel bound to a
 * persona is answered by it, a channel bound to nothing is onboarded by asking which persona to use,
 * and the answer is written back as a binding the chat realm stores without reading (`@@D-725`).
 *
 * A turn is an append, not a new session: the conversation keeps one session while it stays inside the
 * persona's continuation window, and a turn extends that session's transcript with a user message
 * before the run continues from it. A window that has passed, or `/new`, closes the session and the
 * next message opens another (`@@D-729`).
 */
export interface IAgentChatReceiveResult {
    /** `answered` when the run produced a reply, `asked` when a persona pick went out, `command`. */
    status: 'answered' | 'asked' | 'command'
    sessionId?: string;
    personaKey?: string;
    message?: string;
}

interface IPersona {
    personaId?: string;
    personaKey?: string;
    title?: string;
    description?: string;
    /** JSON array of tool names, as the column stores it; `[]` is a toolless persona. */
    tools?: string;
    engineAdapter?: string;
    engineAccount?: string;
    engineMode?: string;
    modelName?: string;
    instructions?: string;
    workspaceMode?: string;
    continuationMinutes?: number;
    greeting?: string;
}

const thisHost = (): string => process.env.HOSTNAME ?? hostname();

/**
 * The id of the question a channel is asked about its persona.
 *
 * Derived from the channel, so a caller can answer without being told an id, and **without a colon**:
 * a platform carries the id inside an interactive element's own id, and that one is split on colons to
 * be read back — a colon in the prompt id shifted every field after it and the click answered a prompt
 * nobody was waiting for (`@@F-671`).
 */
export const pickPromptId = (inbound: {platform: string; account?: string; conversationId: string}): string =>
    `pickpersona${createHash('sha1').update(channelKeyOf(inbound)).digest('hex').slice(0, 24)}`;

/** A persona's tool list, as the run wants it: names, with a broken JSON meaning none rather than all. */
const personaTools = (tools: string): string[] => {
    try {
        const parsed = JSON.parse(tools) as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
};

/** The key a conversation is remembered under: platform, account and conversation, in one string. */
export const channelKeyOf = (inbound: {
    platform: string;
    account?: string;
    conversationId: string;
}): string => `${inbound.platform}:${inbound.account ?? ''}:${inbound.conversationId}`;

/** The statuses a message may continue: a spent turn is `done`, which is still the same conversation. */
const OPEN = new Set(['running', 'awaiting', 'suspended', 'claimed', 'done']);

export default handler(
    ({
        handler: {
            'db/agentPersonaFind': agentPersonaFind,
            agentPersonaSeed,
            'db/agentSessionAdd': agentSessionAdd,
            'db/agentSessionEdit': agentSessionEdit,
            'db/agentSessionFind': agentSessionFind,
            'db/agentCheckpointAdd': agentCheckpointAdd,
            'db/agentCheckpointLastGet': agentCheckpointLastGet,
            'db/agentEventFind': agentEventFind,
            agentSessionRun,
            workspaceRepoPrepare,
        },
    }) => ({
        async agentChatReceive(
            inbound: IChatInbound,
            $meta: IMeta,
        ): Promise<IAgentChatReceiveResult> {
            const port = this as unknown as IAgentDispatchPort;
            const settings = agentSettings(port.config);
            const text = String(inbound.text ?? '').trim();
            if (!text) return {status: 'answered'};
            const channelKey = channelKeyOf(inbound);
            // The chat realm attaches the row when it forwards; a caller that reached this method another
            // way has not, so the row is read here too — writing the binding and reading it back must not
            // need two different callers.
            const channel = inbound.channel ?? (await findChannel(port, inbound, $meta));
            let persona = await personaOfBoundChannel(agentPersonaFind, channel, $meta);
            if (!persona) {
                const picked = await pickPersona(
                    port,
                    settings,
                    agentPersonaFind,
                    inbound,
                    channel,
                    $meta,
                    agentPersonaSeed,
                );
                if (!picked) return {status: 'asked'};
                // The message that made the channel choose is answered by the choice: onboarding is
                // not a detour a person has to repeat.
                persona = picked;
            }
            const command = /^\/([a-z]+)\s*(.*)$/i.exec(text);
            if (command) {
                const handled = await runCommand(
                    {port, settings, agentPersonaFind, agentSessionEdit, agentSessionFind, agentEventFind, agentCheckpointLastGet},
                    inbound,
                    {persona, channelKey, channel, verb: command[1].toLowerCase(), argument: command[2].trim()},
                    $meta,
                );
                if (handled) return handled;
            }
            const sessionId = await openOrCreateSession(
                {
                    port,
                    settings,
                    agentSessionAdd,
                    agentSessionEdit,
                    agentSessionFind,
                    agentCheckpointAdd,
                    agentCheckpointLastGet,
                    workspaceRepoPrepare,
                },
                inbound,
                persona,
                channelKey,
                $meta,
            );
            // The transcript is extended before the run, because a run continues from the checkpoint it
            // finds: an opening prompt only reaches a session that has none.
            const last = (await agentCheckpointLastGet({sessionId}, $meta)) as {
                checkpoint?: Record<string, unknown>;
            };
            if (last.checkpoint) {
                const history = agentHistory(last.checkpoint.historyJSON);
                history.push({role: 'user', text});
                await agentCheckpointAdd(
                    {
                        checkpointId: randomUUID(),
                        sessionId,
                        sequence: Number(last.checkpoint.sequence ?? 0) + 1,
                        historyJSON: JSON.stringify(history),
                        stepCount: Number(last.checkpoint.stepCount ?? 0),
                    },
                    $meta,
                );
            }
            const ran = (await agentSessionRun(
                {
                    sessionId,
                    workerId: thisHost(),
                    prompt: text,
                    ...(persona.instructions && {instructions: persona.instructions}),
                    // A persona that lists no tool is offered none, so the model cannot park the
                    // conversation on a question nobody is waiting to answer.
                    ...(persona.tools !== undefined && {
                        tools: personaTools(persona.tools),
                    }),
                    channel: {
                        platform: inbound.platform,
                        account: inbound.account,
                        conversationId: inbound.conversationId,
                    },
                },
                $meta,
            )) as {status?: string; summary?: string};
            await agentSessionEdit(
                {
                    sessionId,
                    patch: {lastActivityAt: new Date().toISOString()},
                },
                $meta,
            );
            if (ran.summary) {
                await reply(port, settings, inbound, ran.summary, $meta);
            }
            return {
                status: 'answered',
                sessionId,
                personaKey: persona.personaKey,
                message: ran.summary,
            };
        },
    }),
);

/** The conversation this message belongs to, read from the realm that keeps conversations. */
const findChannel = async (
    port: IAgentDispatchPort,
    inbound: IChatInbound,
    $meta: IMeta,
): Promise<IChatChannel | undefined> => {
    if (!port.dispatch) return undefined;
    const found = await port.dispatch(
        {
            platform: inbound.platform,
            account: inbound.account ?? '',
            conversationId: inbound.conversationId,
        },
        {...$meta, method: 'chat.channel.find', mtid: 'request'},
    );
    const value = Array.isArray(found) ? found[0] : found;
    const channel = (value as {channel?: IChatChannel} | undefined)?.channel;
    return channel && typeof channel === 'object' ? channel : undefined;
};

/** The personas a picker may offer: enabled, and named by a key a binding can hold. */
const enabledPersonas = async (
    agentPersonaFind: Port['find'],
    $meta: IMeta,
): Promise<IPersona[]> => {
    const found = (await agentPersonaFind({enabled: true}, $meta)) as {personas?: IPersona[]};
    return (found.personas ?? []).filter(persona => persona.personaKey);
};

/** The persona a channel is bound to, when the binding names one this deployment still offers. */
const personaOfBoundChannel = async (
    agentPersonaFind: Port['find'],
    channel: IChatChannel | undefined,
    $meta: IMeta,
): Promise<IPersona | undefined> => {
    if (channel?.bindingKind !== 'persona' || !channel.bindingKey) return undefined;
    const found = (await agentPersonaFind(
        {personaKey: channel.bindingKey, limit: 1},
        $meta,
    )) as {personas?: IPersona[]};
    const persona = found.personas?.[0];
    return persona?.personaKey ? persona : undefined;
};

/**
 * Ask which persona this channel talks to, and remember the answer.
 *
 * One candidate binds without asking: a deployment that ships a single persona has nothing to choose,
 * and a question with one button is a question nobody wants. The bind is written back through the chat
 * realm, so the row it keeps is the only place a channel's persona is remembered.
 */
const pickPersona = async (
    port: IAgentDispatchPort,
    settings: IAgentDispatchSettings,
    agentPersonaFind: Port['find'],
    inbound: IChatInbound,
    channel: IChatChannel | undefined,
    $meta: IMeta,
    seedPersonas?: (params: object, $meta: IMeta) => unknown,
): Promise<IPersona | undefined> => {
    let personas = await enabledPersonas(agentPersonaFind, $meta);
    if (personas.length === 0) {
        // A run that is neither `upgrade` nor `dev` never dispatches the seed phase, so the first
        // conversation is what materialises the presets it was configured with.
        await seedPersonas?.({}, $meta);
        personas = await enabledPersonas(agentPersonaFind, $meta);
    }
    if (personas.length === 0) {
        await reply(
            port,
            settings,
            inbound,
            'No persona is configured for this deployment.',
            $meta,
        );
        return undefined;
    }
    if (personas.length === 1) {
        await bindPersona(port, inbound, channel, personas[0].personaKey as string, $meta);
        return personas[0];
    }
    // A pick belongs to the channel, so its id does: a repeat ask replaces the question rather than
    // leaving a second one nobody can tell apart.
    const promptId = pickPromptId(inbound);
    const answered = await ask(port, settings, inbound, $meta, {
        promptId,
        text: 'Which persona should this channel use?',
        options: personas.map(persona => ({
            value: String(persona.personaKey),
            label: String(persona.title ?? persona.personaKey),
            ...(persona.description && {description: persona.description}),
        })),
    });
    const personaKey = answered ?? '';
    if (!personaKey) return undefined;
    const picked = personas.find(persona => persona.personaKey === personaKey);
    if (!picked) {
        await reply(port, settings, inbound, `That persona is not available: ${personaKey}`, $meta);
        return undefined;
    }
    await bindPersona(port, inbound, channel, personaKey, $meta);
    return picked;
};

/** Store the binding on the channel, creating the row when chat has not met this conversation yet. */
const bindPersona = async (
    port: IAgentDispatchPort,
    inbound: IChatInbound,
    channel: IChatChannel | undefined,
    personaKey: string,
    $meta: IMeta,
): Promise<void> => {
    if (!port.dispatch) return;
    if (channel?.channelId) {
        await port.dispatch(
            {
                channelId: channel.channelId,
                patch: {bindingKind: 'persona', bindingKey: personaKey},
            },
            {...$meta, method: 'chat.channel.edit', mtid: 'request'},
        );
        return;
    }
    await port.dispatch(
        {
            platform: inbound.platform,
            account: inbound.account ?? '',
            conversationId: inbound.conversationId,
            consumerMethod: $meta.method,
            bindingKind: 'persona',
            bindingKey: personaKey,
        },
        {...$meta, method: 'chat.channel.add', mtid: 'request'},
    );
};

/**
 * The session this message continues, opening one when there is none to continue.
 *
 * A chat session is remembered by its conversation and not by a ticket, so a workspace persona gets one
 * prepared under the conversation's own key: the workspace adapter names the thing it prepares
 * `ticketId`, and a conversation is a thing it can prepare just as well.
 */
const openOrCreateSession = async (
    ports: {
        port: IAgentDispatchPort;
        settings: IAgentDispatchSettings;
        agentSessionAdd: Port['add'];
        agentSessionEdit: Port['edit'];
        agentSessionFind: Port['findSession'];
        agentCheckpointAdd: Port['addCheckpoint'];
        agentCheckpointLastGet: Port['lastCheckpoint'];
        workspaceRepoPrepare: Port['prepare'];
    },
    inbound: IChatInbound,
    persona: IPersona,
    channelKey: string,
    $meta: IMeta,
): Promise<string> => {
    const windowMinutes =
        Number(persona.continuationMinutes) || ports.settings.continuationMinutes || 1440;
    const found = (await ports.agentSessionFind(
        {channelKey, source: 'chat', limit: 10},
        $meta,
    )) as {sessions?: Array<Record<string, unknown>>};
    const session = (found.sessions ?? []).find(candidate => {
        if (!OPEN.has(String(candidate.status ?? ''))) return false;
        const at = Date.parse(String(candidate.lastActivityAt ?? candidate.createdAt ?? ''));
        return Number.isFinite(at) && Date.now() - at < windowMinutes * 60_000;
    });
    if (session?.sessionId) return String(session.sessionId);
    const sessionId = randomUUID();
    let workspacePath: string | undefined;
    if (persona.workspaceMode !== 'none') {
        const prepared = (await ports.workspaceRepoPrepare({ticketId: channelKey}, $meta)) as {
            workspacePath?: string;
        };
        workspacePath = prepared.workspacePath;
    }
    await ports.agentSessionAdd(
        {
            sessionId,
            // The conversation stands in for the ticket: the column predates chat sessions and the
            // schema sync adds columns rather than relaxing them, so a chat row carries its channel key
            // rather than a null the table may refuse.
            ticketId: channelKey,
            source: 'chat',
            personaId: persona.personaId,
            channelKey,
            status: 'running',
            engineAdapter: persona.engineAdapter ?? ports.settings.engineAdapter,
            engineAccount: persona.engineAccount ?? ports.settings.engineAccount,
            engineMode: persona.engineMode ?? 'step',
            ...(persona.modelName && {modelName: persona.modelName}),
            workerId: thisHost(),
            workspacePath: workspacePath ?? '',
        },
        $meta,
    );
    if (persona.greeting) {
        await reply(ports.port, ports.settings, inbound, persona.greeting, $meta);
    }
    return sessionId;
};

/**
 * A slash command, handled here rather than sent to the model.
 *
 * Slack only intercepts the commands an app registers, so an unregistered `/new` arrives as ordinary
 * message text — which is why these are parsed and not configured (`@@D-729`). A verb nobody knows is
 * not a command: it falls through to the model, because a message that begins with a slash is still a
 * message.
 */
const runCommand = async (
    ports: {
        port: IAgentDispatchPort;
        settings: IAgentDispatchSettings;
        agentPersonaFind: Port['find'];
        agentSessionEdit: Port['edit'];
        agentSessionFind: Port['findSession'];
        agentEventFind: Port['findEvent'];
        agentCheckpointLastGet: Port['lastCheckpoint'];
    },
    inbound: IChatInbound,
    request: {
        persona: IPersona;
        channelKey: string;
        channel: IChatChannel | undefined;
        verb: string;
        argument: string;
    },
    $meta: IMeta,
): Promise<IAgentChatReceiveResult | undefined> => {
    const {persona, channelKey, channel: bound, verb, argument} = request;
    /** Say it in the channel and hand the same text back, so a caller that is not a channel sees it. */
    const say = async (
        text: string,
        extra: {sessionId?: string; personaKey?: string} = {},
    ): Promise<IAgentChatReceiveResult> => {
        await reply(ports.port, ports.settings, inbound, text, $meta);
        return {
            status: 'command',
            message: text,
            personaKey: extra.personaKey ?? persona.personaKey,
            ...(extra.sessionId && {sessionId: extra.sessionId}),
        };
    };
    const open = async (): Promise<Record<string, unknown> | undefined> => {
        const found = (await ports.agentSessionFind(
            {channelKey, source: 'chat', limit: 10},
            $meta,
        )) as {sessions?: Array<Record<string, unknown>>};
        return (found.sessions ?? []).find(session => OPEN.has(String(session.status ?? '')));
    };
    if (verb === 'help') return say(HELP);
    if (verb === 'new') {
        const session = await open();
        if (session?.sessionId) {
            await ports.agentSessionEdit(
                {sessionId: String(session.sessionId), patch: {status: 'closed'}},
                $meta,
            );
        }
        return say(
            `A new conversation with ${persona.title ?? persona.personaKey} starts with your next message.`,
        );
    }
    if (verb === 'persona') {
        const found = (await ports.agentPersonaFind({enabled: true}, $meta)) as {
            personas?: IPersona[];
        };
        const personas = (found.personas ?? []).filter(candidate => candidate.personaKey);
        if (!argument)
            return say(
                ['Available personas:', ...personas.map(one => `- ${one.personaKey}: ${one.title}`)].join(
                    '\n',
                ),
            );
        const picked = personas.find(candidate => candidate.personaKey === argument);
        if (!picked) return say(`No such persona: ${argument}. Try /persona for the list.`);
        await bindPersona(ports.port, inbound, bound, argument, $meta);
        const session = await open();
        if (session?.sessionId) {
            await ports.agentSessionEdit(
                {sessionId: String(session.sessionId), patch: {status: 'closed'}},
                $meta,
            );
        }
        return say(`This channel now talks to ${picked.title ?? argument}.`, {personaKey: argument});
    }
    if (verb === 'stats') {
        const session = await open();
        if (!session?.sessionId) return say('Nothing to report yet.');
        const sessionId = String(session.sessionId);
        const events = (await ports.agentEventFind({sessionId, limit: 1000}, $meta)) as {
            events?: Array<Record<string, unknown>>;
        };
        const last = (await ports.agentCheckpointLastGet({sessionId}, $meta)) as {
            checkpoint?: Record<string, unknown>;
        };
        return say(statsText(session, last.checkpoint, events.events ?? [], persona), {sessionId});
    }
    return undefined;
};

/**
 * The stats a conversation can answer for itself.
 *
 * Everything here is derived from rows that already exist — the checkpoint's step count and transcript
 * size, the tool events, the session's own timestamps — because the engine reports no token usage yet:
 * that is a later task and the one number this text cannot show.
 */
const statsText = (
    session: Record<string, unknown>,
    checkpoint: Record<string, unknown> | undefined,
    events: Array<Record<string, unknown>>,
    persona: IPersona,
): string => {
    const tools = new Map<string, number>();
    let steps = 0;
    for (const event of events) {
        if (event.kind === 'tool') {
            let name = 'unknown';
            try {
                const payload = JSON.parse(String(event.payloadJSON ?? '{}')) as {toolName?: string};
                name = payload.toolName ?? name;
            } catch {
                // A payload that is not JSON is still a call; it just has no name to group under.
            }
            tools.set(name, (tools.get(name) ?? 0) + 1);
        }
        if (event.kind === 'step') steps += 1;
    }
    const historyBytes = String(checkpoint?.historyJSON ?? '').length;
    const created = Date.parse(String(session.createdAt ?? ''));
    const windowMinutes = Number(persona.continuationMinutes) || 1440;
    const left = Number.isFinite(created)
        ? Math.max(0, Math.round(windowMinutes - (Date.now() - created) / 60_000))
        : 0;
    const lines = [
        `Persona: ${persona.title ?? persona.personaKey}`,
        `Session: ${String(session.sessionId ?? '')}`,
        `Status: ${String(session.status ?? '')}`,
        `Steps: ${Number(checkpoint?.stepCount ?? 0)} (events: ${steps})`,
        `Turns: ${Number(session.turnCount ?? 0)}`,
        `History: ${historyBytes} characters`,
        `Tool calls: ${
            tools.size
                ? [...tools.entries()].map(([name, count]) => `${name} x${count}`).join(', ')
                : 'none'
        }`,
        `Compactions: ${Number(session.compactionCount ?? 0)}`,
        `Window left: ${left} minutes`,
    ];
    if (session.workspacePath) lines.push(`Workspace: ${String(session.workspacePath)}`);
    return lines.join('\n');
};

const HELP = [
    'Commands:',
    '/new — start a new conversation',
    '/persona — list the personas this channel may use',
    '/persona <key> — switch this channel to that persona',
    '/stats — turns, steps, tools and history of this conversation',
    '/help — this list',
].join('\n');

/** Ask one question through the port's question method and return the value that was picked. */
const ask = async (
    port: IAgentDispatchPort,
    settings: IAgentDispatchSettings,
    inbound: IChatInbound,
    $meta: IMeta,
    prompt: {promptId: string; text: string; options?: Array<{value: string; label: string; description?: string}>},
): Promise<string | undefined> => {
    if (!port.dispatch) return undefined;
    const answered = await port.dispatch(
        {
            platform: inbound.platform,
            account: inbound.account,
            conversationId: inbound.conversationId,
            text: prompt.text,
            kind: 'choice',
            options: prompt.options,
            promptId: prompt.promptId,
            timeoutMs: settings.questionTimeoutMs,
        },
        {...$meta, method: settings.questionMethod, mtid: 'request'},
    );
    const value = valueOf(answered);
    return value ? String(value) : undefined;
};

/** Send a message to the conversation the inbound message came from. */
const reply = async (
    port: IAgentDispatchPort,
    settings: IAgentDispatchSettings,
    inbound: IChatInbound,
    text: string,
    $meta: IMeta,
): Promise<void> => {
    if (!port.dispatch) return;
    await port.dispatch(
        {
            platform: inbound.platform,
            account: inbound.account,
            conversationId: inbound.conversationId,
            text,
        },
        {...$meta, method: settings.replyMethod, mtid: 'request'},
    );
};

/**
 * The value inside whatever a dispatch replied with.
 *
 * A dispatch answers the response the callee produced, sometimes wrapped in the array the transport
 * carries, and a platform names the selection differently — `value` for a choice, `text` for a typed
 * reply, `answer.value` when it is nested.
 */
const valueOf = (value: unknown): unknown => {
    if (Array.isArray(value)) return valueOf(value[0]);
    if (!value || typeof value !== 'object') return undefined;
    const answer = value as {value?: unknown; text?: unknown; answer?: {value?: unknown}};
    return answer.value ?? answer.text ?? answer.answer?.value;
};

/** The injected handlers this file calls, named so the shapes stay readable. */
interface Port {
    find: (params: {personaKey?: string; enabled?: boolean; limit?: number}, $meta: IMeta) => unknown;
    add: (params: Record<string, unknown>, $meta: IMeta) => unknown;
    edit: (params: Record<string, unknown>, $meta: IMeta) => unknown;
    findSession: (params: Record<string, unknown>, $meta: IMeta) => unknown;
    findEvent: (params: Record<string, unknown>, $meta: IMeta) => unknown;
    addCheckpoint: (params: Record<string, unknown>, $meta: IMeta) => unknown;
    lastCheckpoint: (params: Record<string, unknown>, $meta: IMeta) => unknown;
    prepare: (params: Record<string, unknown>, $meta: IMeta) => unknown;
}
