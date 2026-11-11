import {schema} from '@feasibleone/blong';

/**
 * `meta/type/schema.ts` — the three tables this realm keeps.
 *
 * `workspace` is the Slack workspace whose app-configuration token maintains every app this
 * deployment owns. The pair lives here, once, because a configuration token authorizes app
 * management in a workspace and not for one bot: two accounts of one workspace share it, and a
 * rotation must replace it in one place (`@@D-797`).
 *
 * `account` is the bot account a person manages: the two ids an incoming request names, the
 * credential each half of the conversation is made with, and the workspace whose token maintains its
 * app. It is a table rather than a Secret because a person adds and edits accounts from the portal,
 * and because what a rotation or an app creation learned has to be written somewhere the next start
 * can read (`@@D-797`).
 *
 * A channel is the conversation the realm remembers: who it is at the platform, who receives its
 * messages, and the binding it carries. The binding is three generic columns rather than a persona
 * field, because what sits behind them is the consumer's vocabulary and this realm never reads it
 * (`@@D-725`).
 *
 * The timestamps are the continuation window's only input: `lastActivityAt` is when the consumer is
 * allowed to treat the next message as the same conversation, and `turnCount` is what a queue would
 * count if one is added later.
 *
 * Every timestamp is nullable, which is the house rule for a server-managed column: the gateway
 * validates CRUD params against the schema, so a not-null column is a column every caller has to send.
 * The handlers that create and edit a row fill them (`@@T-625`).
 */
export default schema(async ({lib: {type}}) => ({
    workspace: type.Object(
        {
            workspaceId: type.uuid(),
            /** The platform this workspace belongs to; a Slack workspace is not a Viber one. */
            platform: type.stringNotNull({maxLength: 32}),
            /** The alias an account names this workspace by, and the app-manager's own label. */
            workspaceName: type.stringNotNull({maxLength: 64}),
            /** Slack's app configuration token (`xoxe.xoxp-…`), which maintains every app here. */
            configToken: type.stringNull({maxLength: 2048}),
            /** The pair's refresh token; spending it replaces both (`@@D-797`). */
            configRefreshToken: type.stringNull({maxLength: 2048}),
            configTokenExpiresAt: type.dateTimeNull(),
            /** `enabled` workspaces are maintained; a disabled one keeps its pair and is left out. */
            workspaceStatus: type.stringNotNull({maxLength: 16}),
            createdAt: type.dateTimeNull(),
            updatedAt: type.dateTimeNull(),
        },
        {
            constraints: {
                primaryKey: 'workspaceId',
                unique: {
                    address: {columns: ['platform', 'workspaceName']},
                },
                index: {
                    workspaceStatus: {},
                },
            },
        },
    ),
    account: type.Object(
        {
            accountId: type.uuid(),
            /** The platform this account talks to; a Slack account and a Viber one never collide. */
            platform: type.stringNotNull({maxLength: 32}),
            /** The alias the port addresses the account by, and the name its app is created with. */
            accountAlias: type.stringNotNull({maxLength: 64}),
            /** The workspace whose configuration token maintains this account's app (`@@D-797`). */
            workspace: type.stringNull({maxLength: 64}),
            appId: type.stringNull({maxLength: 64}),
            clientId: type.stringNull({maxLength: 128}),
            /** The bot token the Web API is called with; absent until the app is installed. */
            botToken: type.stringNull({maxLength: 512}),
            /** The signing secret an incoming request is verified with. */
            signingSecret: type.stringNull({maxLength: 256}),
            /** Viber's auth token, which is both the API credential and the signature key. */
            authToken: type.stringNull({maxLength: 512}),
            /** The API base this account calls; null is the platform's own. */
            apiUrl: type.stringNull({maxLength: 512}),
            /** The fixed public base this account is reachable at, when a deployment provides one. */
            publicUrl: type.stringNull({maxLength: 512}),
            /** `enabled` accounts are served; a disabled one keeps its row and is left out. */
            accountStatus: type.stringNotNull({maxLength: 16}),
            createdAt: type.dateTimeNull(),
            updatedAt: type.dateTimeNull(),
        },
        {
            constraints: {
                primaryKey: 'accountId',
                unique: {
                    address: {columns: ['platform', 'accountAlias']},
                },
                index: {
                    workspace: {},
                    accountStatus: {},
                },
            },
        },
    ),
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
            createdAt: type.dateTimeNull(),
            updatedAt: type.dateTimeNull(),
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
