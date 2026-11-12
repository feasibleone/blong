import {handler, type IMeta} from '@feasibleone/blong';
import type {IChatChannelCreated} from '@feasibleone/blong/types';

/**
 * `chat.channel.create` — open a channel of its own, rather than answer one that arrived.
 *
 * Every other handler in this realm reacts to a conversation a person started. A plan needs the
 * opposite: a channel that exists because the work does, whose topic names the GitHub issue and
 * whose id a caller stores so questions about the plan have an address (`@@D-805`).
 *
 * The platform calls are the port's; the realm's work is the order and the bookkeeping — the purpose
 * (Slack's readable title, since the name is lowercase) and the topic after the create because Slack
 * has no creation parameter for either, the invite after the create because a private channel has no
 * members, and the row written last so a failed create leaves no half-met channel. A channel that
 * already exists is the caller's to remember: a name Slack holds answers `name_taken`, and the caller
 * that created it is the one that stored the id (`@@D-805`).
 */
export interface IChatChannelCreateInput {
    platform: 'slack' | 'viber';
    account?: string;
    /** The name the platform will hold; built by the caller from whatever the channel stands for. */
    channelName: string;
    /** A human title, used as the topic when no explicit topic is given. */
    title?: string;
    topic?: string;
    /** Private by default: work in progress is not a workspace announcement. */
    isPrivate?: boolean;
    /** Platform user ids to add once the channel exists. */
    invite?: string[];
}

/** What Slack answers a create with, as far as this realm reads it. */
interface ISlackChannelAnswer {
    ok?: boolean;
    error?: string;
    channel?: {id?: string; name?: string};
}

export default handler(
    ({
        handler: {
            slackChannelCreate,
            slackChannelPurpose,
            slackChannelTopic,
            slackChannelInvite,
            chatChannelAdd,
        },
        errors: {errorChatPlatformUnsupported, errorChatChannelCreateFailed},
    }) => ({
        async chatChannelCreate(
            params: IChatChannelCreateInput,
            $meta: IMeta,
        ): Promise<{channel: IChatChannelCreated}> {
            if (params.platform !== 'slack') {
                throw errorChatPlatformUnsupported(
                    {params: {platformName: String(params.platform), controlKind: 'channel'}},
                    $meta,
                );
            }

            const topic = params.topic ?? (params.title ? `Plan: ${params.title}` : undefined);

            const created = (await slackChannelCreate(
                {
                    account: params.account,
                    channelName: params.channelName,
                    isPrivate: params.isPrivate ?? true,
                },
                $meta,
            )) as ISlackChannelAnswer | undefined;
            const conversationId = created?.channel?.id;
            if (!conversationId) {
                throw errorChatChannelCreateFailed(
                    {
                        params: {
                            platformName: params.platform,
                            channelName: params.channelName,
                            reason: created?.error ?? 'the platform answered no channel id',
                        },
                    },
                    $meta,
                );
            }

            if (params.title) {
                // The name is lowercase and hyphenated, so the readable title lives in the purpose.
                await slackChannelPurpose(
                    {account: params.account, conversationId, purpose: params.title},
                    $meta,
                );
            }
            if (topic) {
                await slackChannelTopic({account: params.account, conversationId, topic}, $meta);
            }
            if (params.invite && params.invite.length > 0) {
                await slackChannelInvite(
                    {account: params.account, conversationId, invite: params.invite},
                    $meta,
                );
            }

            // The row is what a later message is answered from, and what keeps the channel in this
            // realm's own vocabulary (`@@D-725`).
            await chatChannelAdd(
                {
                    platform: params.platform,
                    account: params.account,
                    conversationId,
                    conversationTitle: created?.channel?.name ?? params.channelName,
                },
                $meta,
            );

            return {
                channel: {
                    platform: params.platform,
                    account: params.account ?? '',
                    conversationId,
                    channelName: created?.channel?.name ?? params.channelName,
                    ...(topic ? {topic} : {}),
                },
            };
        },
    }),
);
