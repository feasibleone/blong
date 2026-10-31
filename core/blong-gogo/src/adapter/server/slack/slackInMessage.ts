import type {IChatInbound} from '@feasibleone/blong/types';
import {handler, type IMeta} from '@feasibleone/blong/types';

import {chatPromptActionParse} from '../../../chatActions.ts';

/**
 * `slackIn.message` — what Slack sent, in the realm's one vocabulary.
 *
 * Three payload shapes arrive at the same path and mean three different things: an Events API
 * delivery (a message), a `url_verification` challenge (nothing to process), and an interactive
 * component posted form-encoded as `payload`. The challenge is answered by the `server` hook, and a
 * button is mapped to the answer it stands for.
 */
interface IHookRequest {
    params?: {appId?: string; clientId?: string; action?: string};
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer;
    body?: unknown;
}

interface ISlackIdentity {
    account?: string;
    appId?: string;
    clientId?: string;
}

/** Slack sends links as `<mailto:a@b|a@b>`; a person reading the realm wants the address. */
const MAIL_TO = /<mailto:([^>|]+)\|([^>]*)>/g;
const sanitize = (text?: string): string | undefined =>
    typeof text === 'string'
        ? text.replace(MAIL_TO, (_all, address: string) => address)
        : undefined;

const parse = (text: unknown): Record<string, unknown> | undefined => {
    try {
        const value = JSON.parse(String(text));
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    } catch {
        return undefined;
    }
};

const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

/**
 * The selection an interactive element carries, in the realm's vocabulary.
 *
 * One control per element, so the two shapes are the whole of it: a radio group answers with
 * `selected_option` and a checkbox list with `selected_options`. An element the person left alone is
 * reported as nothing selected, which is not the same as not reported.
 */
const picked = (element: Record<string, unknown>): {value?: string; values?: string[]} => {
    const radio = (element.selected_option ?? undefined) as {value?: unknown} | undefined;
    const boxes = Array.isArray(element.selected_options)
        ? (element.selected_options as Array<{value?: unknown}>)
        : [];
    const values = boxes
        .map(option => option.value)
        .filter((value): value is string => typeof value === 'string');
    return {
        ...(typeof radio?.value === 'string' && {value: radio.value}),
        ...(values.length && {values}),
    };
};

/**
 * Every selection the message was holding when it was submitted.
 *
 * Read by shape rather than by block id: the question is the only thing this port posts with a radio
 * group or a checkbox list, so whatever carries one is the pick, whatever the ids were called.
 */
const pickedFromState = (state: unknown): {value?: string; values?: string[]} => {
    const values = ((state as {values?: Record<string, Record<string, unknown>>} | undefined)
        ?.values ?? {}) as Record<string, Record<string, unknown>>;
    let found: {value?: string; values?: string[]} = {};
    for (const block of Object.values(values)) {
        for (const element of Object.values(block ?? {})) {
            const read = picked(element as Record<string, unknown>);
            if (read.value !== undefined || read.values) found = {...found, ...read};
        }
    }
    return found;
};

export default handler(() => {
    const mapEvent = (
        base: Record<string, unknown>,
        payload: Record<string, unknown>,
    ): IChatInbound | false => {
        const event = (payload.event ?? {}) as Record<string, unknown>;
        if (event.type !== 'message') return false;
        // A bot's own message must not re-enter the realm, or a reply would answer itself.
        if (event.bot_id || event.subtype === 'bot_message') return false;
        const files = Array.isArray(event.files) ? (event.files as Record<string, unknown>[]) : [];
        const ts = text(event.ts);
        return {
            ...(base as unknown as IChatInbound),
            kind: 'message',
            conversationId: text(event.channel) ?? '',
            messageId: text(event.client_msg_id) ?? ts,
            timestamp: ts ? Number.parseInt(ts.split('.')[0] ?? '0', 10) || undefined : undefined,
            sender: {id: text(event.user)},
            type: files.length ? 'image' : 'text',
            text: sanitize(text(event.text)),
            ...(files.length && {
                attachments: files.map(file => ({
                    url: text(file.url_private_download) ?? text(file.url_private),
                    contentType: text(file.mimetype),
                    filename: text(file.name),
                })),
            }),
        };
    };

    const mapBlockActions = (
        base: Record<string, unknown>,
        payload: Record<string, unknown>,
    ): IChatInbound | false => {
        const actions = Array.isArray(payload.actions)
            ? (payload.actions as Record<string, unknown>[])
            : [];
        const action = actions.find(entry => entry && typeof entry.action_id === 'string');
        if (!action) return false;
        const read = chatPromptActionParse(String(action.action_id));
        if (!read) return false;
        const channel = (payload.channel ?? {}) as Record<string, unknown>;
        const container = (payload.container ?? {}) as Record<string, unknown>;
        const conversationId = text(channel.id) ?? text(container.channel_id) ?? '';
        const user = (payload.user ?? {}) as Record<string, unknown>;
        // Who pressed it, so the settled question can say `🗨️ @someone answered` (`@@D-693`).
        const sender = {
            ...(text(user.id) && {id: text(user.id)}),
            ...((text(user.name) ?? text(user.username)) && {
                name: text(user.name) ?? text(user.username),
            }),
        };
        if (read.form) {
            return {
                ...(base as unknown as IChatInbound),
                kind: 'prompt.form',
                conversationId,
                form: {promptId: read.promptId, triggerId: text(payload.trigger_id)},
            };
        }
        if (read.pick) {
            // A toggle is not an answer: the person may tick three boxes before submitting, and each
            // of those is its own interaction. What it carries is the element's whole current
            // selection, which is the state a submit that arrives without one needs (`@@D-691`).
            return {
                ...(base as unknown as IChatInbound),
                kind: 'prompt.pick',
                conversationId,
                pick: {promptId: read.promptId, ...picked(action)},
            };
        }
        if (read.submit) {
            // The submit is the answer, and the selection it carries is whatever the message holds
            // at that moment: Slack reports the state of every stateful element, keyed by block.
            return {
                ...(base as unknown as IChatInbound),
                kind: 'answer',
                conversationId,
                sender,
                answer: {promptId: read.promptId, ...pickedFromState(payload.state), sender},
            };
        }
        return {
            ...(base as unknown as IChatInbound),
            kind: 'answer',
            conversationId,
            sender,
            answer: {promptId: read.promptId, value: read.value, sender},
        };
    };

    const mapViewSubmission = (
        base: Record<string, unknown>,
        payload: Record<string, unknown>,
    ): IChatInbound | false => {
        const view = (payload.view ?? {}) as Record<string, unknown>;
        const meta = parse(view.private_metadata);
        if (!meta || typeof meta.promptId !== 'string') return false;
        const state = (view.state ?? {}) as {values?: Record<string, Record<string, unknown>>};
        const values = state.values ?? {};
        const choice = (values.choice?.value ?? {}) as {
            selected_option?: {value?: string};
        };
        const multi = (values.values?.value ?? {}) as {
            selected_options?: Array<{value?: string}>;
        };
        const free = (values.text?.value ?? {}) as {value?: string};
        const selected = (multi.selected_options ?? [])
            .map(option => option.value)
            .filter((value): value is string => typeof value === 'string');
        const user = (payload.user ?? {}) as Record<string, unknown>;
        return {
            ...(base as unknown as IChatInbound),
            kind: 'answer',
            conversationId: text(meta.conversationId) ?? '',
            sender: {
                ...(text(user.id) && {id: text(user.id)}),
                ...((text(user.name) ?? text(user.username)) && {
                    name: text(user.name) ?? text(user.username),
                }),
            },
            answer: {
                promptId: meta.promptId,
                sender: {
                    ...(text(user.id) && {id: text(user.id)}),
                    ...((text(user.name) ?? text(user.username)) && {
                        name: text(user.name) ?? text(user.username),
                    }),
                },
                ...(typeof choice.selected_option?.value === 'string' && {
                    value: choice.selected_option.value,
                }),
                ...(selected.length && {values: selected}),
                ...(typeof free.value === 'string' && {text: free.value}),
            },
        };
    };

    return function slackInMessage(request: IHookRequest, $meta: IMeta): IChatInbound | false {
        const identity = (($meta as unknown as {auth?: ISlackIdentity}).auth ??
            {}) as ISlackIdentity;
        const body = request.body as Record<string, unknown> | undefined;
        // An interactive component arrives form-encoded as `payload=<json>`; everything else is JSON.
        const payload =
            body && typeof body.payload === 'string' ? parse(body.payload) : (body ?? undefined);
        if (!payload) return false;
        const base = {
            platform: 'slack',
            account: identity.account,
            appId: identity.appId,
            clientId: identity.clientId,
        };
        switch (payload.type) {
            case 'url_verification':
                // Nothing to process; the server hook answers with the challenge.
                return false;
            case 'event_callback':
                return mapEvent(base, payload);
            case 'block_actions':
                return mapBlockActions(base, payload);
            case 'view_submission':
                return mapViewSubmission(base, payload);
            default:
                // A well-formed delivery of a kind this port does not use is acknowledged, not refused:
                // an app subscribed to more events than the bridge needs is not an error.
                return false;
        }
    };
});
