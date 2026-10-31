import {library} from '@feasibleone/blong/types';

/**
 * `slack.acknowledge.get` — the HTTP answer Slack needs, from the body that arrived.
 *
 * One Request URL carries two protocols. An Events API delivery is a JSON body and is answered with
 * the port's `EVENT_RECEIVED`; an interaction is a form whose `payload` field Slack's own client
 * reads, and there the same answer is *not* an acknowledgement: a submitted view is dismissed only
 * by an **empty** 200 — "your HTTP 200 response must be empty for this step to complete
 * successfully" — and any other body leaves the modal standing with "We had some trouble connecting.
 * Try again?" under it (`@@F-645`).
 *
 * `clear` is the explicit form of that empty answer: it empties the view stack whatever is in it, so
 * a question answered after a second view was pushed still closes. A `block_actions` payload only
 * has to be acknowledged, so it gets an empty JSON object — a shape Slack ignores, which is what
 * keeps a button click from being answered with an event body its own client would not parse.
 *
 * A body with no `payload` field is not an interaction, and answers `undefined`: the port's
 * configured response then stands, which is the Events API's answer and a test's.
 */
interface ISlackAcknowledge {
    code: number;
    body: unknown;
}

const parse = (raw: string): Record<string, unknown> | undefined => {
    try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    } catch {
        return undefined;
    }
};

/** The payload Slack's client posted, or `undefined` when the body is not an interaction. */
const interaction = (body: unknown): Record<string, unknown> | undefined => {
    const wrapped = body as {payload?: unknown} | undefined;
    const raw = typeof wrapped?.payload === 'string' ? wrapped.payload : undefined;
    if (raw === undefined) return undefined;
    // A payload that does not parse is still an interaction: it must be acknowledged, not refused.
    return parse(raw) ?? {};
};

export const slackAcknowledgeGet = (body: unknown): ISlackAcknowledge | undefined => {
    const payload = interaction(body);
    if (!payload) return undefined;
    if (payload.type === 'view_submission') return {code: 200, body: {response_action: 'clear'}};
    return {code: 200, body: {}};
};

export default library(() => ({slackAcknowledgeGet}));
