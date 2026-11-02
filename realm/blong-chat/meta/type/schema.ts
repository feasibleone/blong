import {schema} from '@feasibleone/blong';

/**
 * `meta/type/schema.ts` — the one table this realm keeps.
 *
 * A channel is the conversation the realm remembers: who it is at the platform, who receives its
 * messages, and the binding it carries. The binding is three generic columns rather than a persona
 * field, because what sits behind them is the consumer's vocabulary and this realm never reads it
 * (`@@D-725`).
 *
 * The timestamps are the continuation window's only input: `lastActivityAt` is when the consumer is
 * allowed to treat the next message as the same conversation, and `turnCount` is what a queue would
 * count if one is added later.
 */
export default schema(async ({lib: {type}}) => ({
    channel: type.Object(
        {
            channelId: type.uuid(),
            /** The platform's own name, so a Viber conversation and a Slack one never collide. */
            platform: type.stringNotNull({maxLength: 32}),
            /** The adapter account alias; empty when the platform serves one account. */
            account: type.stringNotNull({maxLength: 64}),
            conversationId: type.stringNotNull({maxLength: 255}),
            conversationTitle: type.stringNull({maxLength: 255}),
            /** The method this channel's messages go to; null falls back to the port's forward map. */
            consumerMethod: type.stringNull({maxLength: 128}),
            /** Opaque to this realm: kind, key and whatever parameters the consumer needs. */
            bindingKind: type.stringNull({maxLength: 64}),
            bindingKey: type.stringNull({maxLength: 128}),
            bindingParams: type.stringNull({maxLength: 8000}),
            lastActivityAt: type.dateTimeNull(),
            turnCount: type.integerNull(),
            createdAt: type.dateTimeNotNull(),
            updatedAt: type.dateTimeNotNull(),
        },
        {
            constraints: {
                primaryKey: 'channelId',
                unique: {
                    address: {columns: ['platform', 'account', 'conversationId']},
                },
                index: {
                    conversationId: {},
                    bindingKey: {},
                },
            },
        },
    ),
}));
