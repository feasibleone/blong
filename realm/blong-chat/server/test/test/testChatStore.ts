import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {CREDENTIAL_MASK} from '../../../orchestrator/account/credentialMask.ts';
import {forwardedMessages, resetForwarded} from '../../../testRecord.ts';
import {slackPost, waitFor} from '../../../testSupport.ts';

/**
 * `test.chat.store` — the two stores a deployment keeps, against the database it keeps them in.
 *
 * The conversation memory and the account store are the half of this realm a listener-only run never
 * touches, and they are the half a deployment *does*: a conversation whose consumer is remembered, and
 * the account map the platform port reads instead of its own config (`@@D-725` `@@D-797`). Neither is
 * reachable from a signed request alone, so the group calls the methods the port calls and reads back
 * what the database holds.
 *
 * Every row is removed at the end, including on failure, because the tap run shares its database with
 * whatever else a developer has open.
 */
const message = (id: string, conversationId: string, text: string): string =>
    JSON.stringify({
        type: 'event_callback',
        event_id: id,
        event: {
            type: 'message',
            client_msg_id: id,
            ts: '1700000000.000300',
            channel: conversationId,
            user: 'U1',
            text,
        },
    });

export default handler(({lib: {group}, handler}) => {
    const call = (name: string, params: unknown, $meta: IMeta): Promise<unknown> =>
        (
            handler as unknown as Record<
                string,
                (params: unknown, $meta: IMeta) => Promise<unknown>
            >
        )[name](params, $meta);

    return {
        testChatStore: ({name = 'chat store'}: {name?: string} = {}) =>
            group(name)([
                async function aConversationIsRememberedAndItsConsumerWins(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    resetForwarded();
                    const conversationId = 'D-store-1';
                    const added = (await call(
                        'chatChannelAdd',
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId,
                            conversationTitle: 'A remembered conversation',
                            // The row names a different consumer than the account's forward entry
                            // does: the conversation already answered this question once (`@@D-725`).
                            consumerMethod: 'test.chat.received',
                            bindingKind: 'ticket',
                            bindingKey: 'T-1',
                        },
                        $meta,
                    )) as {channel?: {channelId?: string}};
                    const channelId = added?.channel?.channelId;
                    assert.ok(channelId, 'the conversation is stored');

                    try {
                        const found = (await call(
                            'chat.channel.find',
                            {platform: 'slack', account: 'demo', conversationId},
                            $meta,
                        )) as {channel?: {channelId?: string; turnCount?: number}};
                        assert.equal(
                            found.channel?.channelId,
                            channelId,
                            'and found again by the address a message carries',
                        );

                        // Through the port: the stored row travels with the message, and answering it
                        // counts a turn — the continuation window is measured from that (`@@D-725`).
                        const answer = await slackPost(message('Ev-store-1', conversationId, 'hello'));
                        assert.equal(answer.status, 200, 'the delivery is acknowledged');
                        const recorded = await waitFor(() =>
                            forwardedMessages().find(entry => entry.messageId === 'Ev-store-1'),
                        );
                        const carried = recorded as unknown as {
                            channel?: {channelId?: string; bindingKey?: string};
                        };
                        assert.equal(
                            carried.channel?.channelId,
                            channelId,
                            'the consumer receives the conversation it was answering in',
                        );
                        assert.equal(
                            carried.channel?.bindingKey,
                            'T-1',
                            'with the binding the conversation carries, which this realm never reads',
                        );

                        const touched = (await call(
                            'chat.channel.find',
                            {platform: 'slack', account: 'demo', conversationId},
                            $meta,
                        )) as {channel?: {turnCount?: number}};
                        assert.equal(
                            touched.channel?.turnCount,
                            1,
                            'and the message counted a turn on the way through',
                        );
                    } finally {
                        await call(
                            'chatChannelEdit',
                            {channelId, patch: {conversationTitle: 'closed', touch: true}},
                            $meta,
                        );
                        const cleared = (await call(
                            'chatChannelFind',
                            {platform: 'slack', account: 'demo', conversationId},
                            $meta,
                        )) as {channel?: {conversationTitle?: string; turnCount?: number}};
                        assert.equal(
                            cleared.channel?.conversationTitle,
                            'closed',
                            'an edit writes the field it was given',
                        );
                        assert.equal(
                            cleared.channel?.turnCount,
                            2,
                            'and touching it again counts another turn',
                        );
                        // The realm has no `remove` of its own for a channel — forgetting a
                        // conversation is not a thing it does — so the row goes through the shared
                        // adapter's generic delete, which is also what keeps this run repeatable.
                        await call('chatChannelRemove', {channelId}, $meta);
                    }
                },

                async function aConversationIsStoredWithTheLeastItNeeds(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // Only the address is required of a caller: every other column is what a
                    // consumer attaches later, so a conversation is storable before anything knows
                    // what it talks to (`@@D-725`).
                    const added = (await call(
                        'chatChannelAdd',
                        {platform: 'viber', conversationId: 'D-store-3'},
                        $meta,
                    )) as {channel?: {channelId?: string; account?: string; turnCount?: number}};
                    const channelId = added?.channel?.channelId;
                    assert.ok(channelId, 'the conversation is stored from its address alone');
                    assert.equal(added.channel?.account, '', 'with the account it did not name empty');
                    assert.equal(added.channel?.turnCount, 0, 'and a turn count that starts at zero');
                    try {
                        const missing = (await call(
                            'chatChannelEdit',
                            {
                                channelId: '00000000-0000-4000-8000-000000000000',
                                patch: {touch: true},
                            },
                            $meta,
                        )) as {updated?: boolean};
                        assert.equal(
                            missing.updated,
                            false,
                            'editing a conversation nobody stored answers that it changed nothing',
                        );
                    } finally {
                        await call('chatChannelRemove', {channelId}, $meta);
                    }
                },

                async function aConversationNobodyHasSeenTravelsWithoutOne(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    resetForwarded();
                    // The other half of the lookup: no row for this address, so the message goes on
                    // with no channel — which is exactly what a consumer opens its onboarding on.
                    const answer = await slackPost(message('Ev-store-2', 'D-store-2', 'first time'));
                    assert.equal(answer.status, 200, 'the delivery is acknowledged');
                    const recorded = await waitFor(() =>
                        forwardedMessages().find(entry => entry.messageId === 'Ev-store-2'),
                    );
                    assert.equal(
                        (recorded as unknown as {channel?: unknown}).channel,
                        undefined,
                        'and no channel is invented for it',
                    );
                    const missing = (await call(
                        'chat.channel.find',
                        {platform: 'slack', account: 'demo', conversationId: 'D-store-2'},
                        $meta,
                    )) as {channel?: unknown};
                    assert.equal(missing?.channel, undefined, 'the store holds nothing for it');
                },

                async function thePortReadsItsAccountsFromTheDatabase(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // The map a platform port runs with: the accounts a person added, each carrying the
                    // configuration token of the workspace it names, so the port has one shape to read
                    // (`@@D-797`). Written through the contract the port itself uses.
                    const workspace = 'store-test-workspace';
                    const alias = 'store-test-account';
                    const pair = {
                        configToken: 'xoxe-store-test',
                        configRefreshToken: 'xoxe-1-store-test',
                    };
                    const created = (await call(
                        'chatWorkspaceAdd',
                        {
                            workspace: {
                                platform: 'slack',
                                workspaceName: workspace,
                                configToken: pair.configToken,
                                configRefreshToken: pair.configRefreshToken,
                                workspaceStatus: 'enabled',
                            },
                        },
                        $meta,
                    )) as {workspace?: {workspaceId?: string}};
                    const workspaceId = created?.workspace?.workspaceId;
                    try {
                        const account = (await call(
                            'chatAccountAdd',
                            {
                                account: {
                                    platform: 'slack',
                                    accountAlias: alias,
                                    workspace,
                                    appId: 'A-store',
                                    accountStatus: 'enabled',
                                    botToken: 'xoxb-store-test',
                                },
                            },
                            $meta,
                        )) as {account?: {accountId?: string}};
                        const accountId = account?.account?.accountId;
                        try {
                            const listed = (await call(
                                'chatCredentialList',
                                {platform: 'slack'},
                                $meta,
                            )) as {accounts?: Record<string, Record<string, unknown>>};
                            const entry = listed.accounts?.[alias];
                            assert.ok(entry, 'the account is in the map the port reads');
                            assert.equal(
                                entry.configToken,
                                pair.configToken,
                                'carrying its workspace’s configuration token',
                            );
                            assert.equal(
                                entry.workspace,
                                workspace,
                                'and the alias a rotation is written back under',
                            );

                            // A rotation: the pair is replaced on the workspace, the app ids on the
                            // account — the two targets one method serves (`@@D-797`).
                            const rotated = (await call(
                                'chatCredentialProvision',
                                {
                                    platform: 'slack',
                                    workspace,
                                    configToken: 'xoxe-store-test-2',
                                    configRefreshToken: 'xoxe-1-store-test-2',
                                },
                                $meta,
                            )) as {updated?: boolean};
                            assert.equal(rotated.updated, true, 'the workspace pair is written back');
                            const appCreated = (await call(
                                'chatCredentialProvision',
                                {platform: 'slack', alias, appId: 'A-store-2', clientId: 'C-store'},
                                $meta,
                            )) as {updated?: boolean};
                            assert.equal(appCreated.updated, true, 'as are the ids an app creation');

                            const after = (await call(
                                'chatCredentialList',
                                {platform: 'slack'},
                                $meta,
                            )) as {accounts?: Record<string, Record<string, unknown>>};
                            assert.equal(
                                after.accounts?.[alias]?.configToken,
                                'xoxe-store-test-2',
                                'the next read answers the renewed pair',
                            );
                            assert.equal(
                                after.accounts?.[alias]?.appId,
                                'A-store-2',
                                'and the ids the app was created with',
                            );

                            // A workspace save: the same two things as an account's, and the pair is
                            // left as it is because the form sent the mask back (`@@T-625`).
                            const saved = (await call(
                                'chatWorkspaceEdit',
                                {
                                    workspace: {
                                        workspaceId: String(workspaceId),
                                        workspaceName: workspace,
                                        configToken: CREDENTIAL_MASK,
                                        configTokenExpiresAt: '2026-12-01T00:00:00.000Z',
                                    },
                                },
                                $meta,
                            )) as {workspace?: {workspaceName?: string}};
                            assert.equal(
                                saved.workspace?.workspaceName,
                                workspace,
                                'the workspace is saved through the route the page calls',
                            );
                            const renewed = (await call(
                                'chatCredentialList',
                                {platform: 'slack'},
                                $meta,
                            )) as {
                                accounts?: Record<
                                    string,
                                    {configToken?: string; configTokenExpiresAt?: unknown}
                                >;
                            };
                            assert.equal(
                                renewed.accounts?.[alias]?.configToken,
                                'xoxe-store-test-2',
                                'and a save that echoed a mask over the pair left it alone',
                            );
                            assert.ok(
                                renewed.accounts?.[alias]?.configTokenExpiresAt,
                                'while the expiry the save named travels with the account',
                            );

                            const nothing = (await call(
                                'chatCredentialProvision',
                                {platform: 'slack'},
                                $meta,
                            )) as {updated?: boolean};
                            assert.equal(
                                nothing.updated,
                                false,
                                'a report that names neither target writes nothing',
                            );
                        } finally {
                            if (accountId) {
                                await call(
                                    'chatAccountRemove',
                                    {accountId: String(accountId)},
                                    $meta,
                                );
                            }
                        }
                    } finally {
                        if (workspaceId) {
                            await call(
                                'chatWorkspaceRemove',
                                {workspaceId: String(workspaceId)},
                                $meta,
                            );
                        }
                    }
                },
            ]),
    };
});
