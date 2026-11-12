/**
 * The Slack channel a plan owns.
 *
 * A plan is worked on over days, and the questions it raises arrive at the wrong moment
 * for a chat window: a channel per plan gives each one an address a person can answer in
 * from a phone, and gives the plan a conversation id that `chat.prompt.ask` can target.
 *
 * The channel itself is created by the chat realm's `chat.channel.create` — the platform
 * token lives in that deployment's database and never in this tool. What this module
 * owns is the name, the topic that carries the issue link, and the shape the answer is
 * read back in.
 */

import {executeCall} from '../commands/call.ts';

/** What a caller asks for. */
export interface IPlanChannelInput {
    /** The plan folder, e.g. `agent`; the channel name derives from it. */
    slug: string;
    /** The plan's title, which becomes the channel's first message/purpose. */
    title: string;
    /** The GitHub issue, which becomes the channel topic. */
    issueUrl?: string;
    platform?: string;
    account?: string;
    /** Slack user ids to add to a private channel. */
    invite?: string[];
    /** The gateway alias the call goes to; the route in `.blong_callrc` otherwise. */
    server?: string;
    /** A gateway address, for a process that is not in the rc — a local run on an ephemeral port. */
    target?: string;
    /** Send plain JSON, for a route the gateway serves without auth (`@@F-710`). */
    plain?: boolean;
    dryRun?: boolean;
}

/** What the realm answered, in the shape a plan stores. */
export interface IPlanChannel {
    platform: string;
    account: string;
    channelName: string;
    /** The id `chat.prompt.ask` addresses as `conversationId`. */
    conversationId: string;
}

/** A channel name Slack accepts: lowercase, digits, `-` and `_`, at most 80. */
export function planChannelName(slug: string): string {
    const cleaned = slug
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
    // A plan whose folder already reads as a plan keeps its own name; the prefix is for the rest,
    // and no channel is called `plan-plan-…`.
    const name = cleaned.startsWith('plan-') ? cleaned : `plan-${cleaned || 'untitled'}`;
    return name.slice(0, 80);
}

/**
 * The topic a plan channel carries: the issue first, then the plan title.
 *
 * The order is the point. Slack shows a channel's topic in the header and cuts it off,
 * so a link written after the title is a link nobody sees; first, it is the first thing
 * a reader can click (`@@D-812`). Slack renders a bare URL in a topic as a link, and
 * 250 characters is the limit it accepts.
 */
export function planChannelTopic(input: {title: string; issueUrl?: string}): string {
    const topic = input.issueUrl
        ? `${input.issueUrl} · Plan: ${input.title}`
        : `Plan: ${input.title}`;
    return topic.slice(0, 250);
}

/**
 * Where a person opens the channel.
 *
 * `app_redirect` is Slack's own deep link: the client or the browser opens the channel
 * from its id alone, with no workspace id in the URL, which is what lets a plan store one
 * link whatever team the bot belongs to.
 */
export function planChannelUrl(input: {
    platform?: string;
    conversationId?: string;
}): string | undefined {
    if (!input.conversationId) return undefined;
    const platform = input.platform ?? 'slack';
    if (platform !== 'slack') return undefined;
    return `https://slack.com/app_redirect?channel=${encodeURIComponent(input.conversationId)}`;
}

/** Read the answer without trusting one shape too far. */
function channelOf(result: unknown): {
    channelName?: string;
    conversationId?: string;
} {
    if (result === null || typeof result !== 'object') return {};
    const body = result as Record<string, unknown>;
    const channel = (body['channel'] ?? body) as Record<string, unknown>;
    return {
        channelName:
            typeof channel['channelName'] === 'string'
                ? channel['channelName']
                : typeof channel['name'] === 'string'
                  ? channel['name']
                  : undefined,
        conversationId:
            typeof channel['conversationId'] === 'string'
                ? channel['conversationId']
                : typeof channel['channelId'] === 'string'
                  ? channel['channelId']
                  : typeof channel['id'] === 'string'
                    ? channel['id']
                    : undefined,
    };
}

/**
 * Create (or find) the plan's channel and answer its address.
 *
 * A private channel is the default because a plan discusses unfinished work; `invite`
 * names the people who have to see it, and the bot is a member by construction when it
 * creates the channel.
 */
export async function createPlanChannel(input: IPlanChannelInput): Promise<IPlanChannel> {
    const platform = input.platform ?? 'slack';
    const account = input.account ?? 'blong-bot';
    const channelName = planChannelName(input.slug);
    const payload = {
        platform,
        account,
        name: channelName,
        title: input.title,
        topic: planChannelTopic({title: input.title, issueUrl: input.issueUrl}),
        isPrivate: true,
        ...(input.invite && input.invite.length > 0 ? {invite: input.invite} : {}),
    };
    const args = ['chat.channel.create', JSON.stringify(payload)];
    if (input.server) args.push('--server', input.server);
    if (input.target) args.push('--target', input.target);
    if (input.plain) args.push('--plain=true');
    if (input.dryRun) {
        return {platform, account, channelName, conversationId: '(dry-run)'};
    }

    const result = await executeCall(args);
    const answer = channelOf(result);
    if (!answer.conversationId) {
        throw new Error(
            'chat.channel.create answered no conversation id — check the account and the ' +
                'chat gateway the call reached',
        );
    }
    return {
        platform,
        account,
        channelName: answer.channelName ?? channelName,
        conversationId: answer.conversationId,
    };
}

/** What a caller asks a channel to say in its topic. */
export interface IPlanTopicInput {
    platform?: string;
    account?: string;
    conversationId: string;
    title: string;
    issueUrl?: string;
    server?: string;
    target?: string;
    plain?: boolean;
    dryRun?: boolean;
}

/**
 * Re-apply a plan channel's topic, for the channel that was opened before its issue
 * existed and for the title that changed after it did.
 *
 * The channel is created once and its id recorded, so the topic cannot ride along with a
 * second create — `conversations.create` answers `name_taken` — and this is the repair
 * `plan sync --channel` calls.
 */
export async function updatePlanChannelTopic(input: IPlanTopicInput): Promise<{
    conversationId: string;
    topic: string;
}> {
    const platform = input.platform ?? 'slack';
    const account = input.account ?? 'blong-bot';
    const topic = planChannelTopic({title: input.title, issueUrl: input.issueUrl});
    if (input.dryRun) return {conversationId: input.conversationId, topic};
    const payload = {platform, account, conversationId: input.conversationId, topic};
    const args = ['chat.channel.topic', JSON.stringify(payload)];
    if (input.server) args.push('--server', input.server);
    if (input.target) args.push('--target', input.target);
    if (input.plain) args.push('--plain=true');
    await executeCall(args);
    return {conversationId: input.conversationId, topic};
}
