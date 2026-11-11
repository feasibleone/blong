import {handler} from '@feasibleone/blong';

/**
 * meta/fixture/chatFixture.ts — the rows Storybook's mock adapter serves for the two pages.
 *
 * The mock reads this once per subject (`blong.handler.chatFixture`) and answers `chat.account.*` and
 * `chat.workspace.*` from their keys, so the browse, new and open pages render without a server. The
 * credentials are placeholders shaped like the real ones; no token here belongs to anybody. The pair
 * lives on the workspace, not on the account (`@@D-797`).
 */
export default handler(
    () =>
        async function chatFixture() {
            return {
                'chat.workspace': [
                    {
                        workspaceId: 'w1',
                        workspaceName: 'feasible',
                        platform: 'slack',
                        workspaceStatus: 'enabled',
                        configToken: 'xoxe.xoxp-1-placeholder',
                        configRefreshToken: 'xoxe-1-placeholder',
                        configTokenExpiresAt: '2026-11-11T00:00:00.000Z',
                    },
                ],
                'chat.account': [
                    {
                        accountId: 'a1',
                        accountAlias: 'blong-bot',
                        platform: 'slack',
                        workspace: 'feasible',
                        accountStatus: 'enabled',
                        appId: 'A0PLACEHOLDER',
                        clientId: '12453365211509.00000000000000',
                        botToken: 'xoxb-0000-0000-placeholder',
                        signingSecret: 'placeholder-signing-secret',
                        publicUrl: 'http://localhost',
                    },
                    {
                        accountId: 'a2',
                        accountAlias: 'qa-bot',
                        platform: 'slack',
                        workspace: 'feasible',
                        accountStatus: 'disabled',
                        appId: null,
                        clientId: null,
                        botToken: null,
                        signingSecret: null,
                        publicUrl: 'http://localhost',
                    },
                ],
            };
        },
);
