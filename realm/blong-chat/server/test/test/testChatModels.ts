import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {CREDENTIAL_MASK} from '../../../orchestrator/account/credentialMask.ts';

/**
 * `test.chat.models` — the two model tables, through the route the pages call.
 *
 * This group exists because the realm used to carry ten handlers of its own just to make these two
 * routes answer: the dispatch port claims the `chat` namespace, held no handler for
 * `chat.account.find` and had no fallback, so the gateway received `undefined` and the pages failed.
 * With `destination: 'db'` on that port the shared adapter answers the model methods from the table
 * schema, which is what every other realm's pages rely on (`@@T-626`). The group is the regression
 * pin: none of this realm's own handlers answers these names any more.
 */
export default handler(({lib: {group}, handler}) => {
    const call = (name: string, params: unknown, $meta: IMeta): Promise<unknown> =>
        (handler as unknown as Record<string, (params: unknown, $meta: IMeta) => Promise<unknown>>)[
            name
        ](params, $meta);

    return {
        testChatModels: ({name = 'chat models'}: {name?: string} = {}) =>
            group(name)([
                async function theModelRouteIsServedByTheSharedAdapter(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const page = (await call(
                        'chatAccountFind',
                        {paging: {pageNumber: 1, pageSize: 10, count: true}},
                        $meta,
                    )) as {items?: unknown[]; pagination?: {recordsTotal?: number}};
                    assert.ok(page, 'the account route answers instead of returning nothing');
                    assert.ok(Array.isArray(page.items), 'as the page of rows a browse page reads');
                    assert.equal(
                        typeof page.pagination?.recordsTotal,
                        'number',
                        'with the total a paginator needs',
                    );

                    const workspace = (await call(
                        'chatWorkspaceFind',
                        {paging: {pageNumber: 1, pageSize: 10, count: true}},
                        $meta,
                    )) as {items?: unknown[]; pagination?: {recordsTotal?: number}};
                    assert.ok(
                        Array.isArray(workspace.items),
                        'and the second model table is served the same way',
                    );
                    assert.equal(
                        typeof workspace.pagination?.recordsTotal,
                        'number',
                        'under the same shape',
                    );
                },

                async function aListHidesTheCredentialsAndARecordKeepsThem(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // A row of accounts is a row of secrets. The list is read by whoever may open the
                    // page; the one record the edit form fills is not (`@@T-625`).
                    const alias = 'test-chat-mask';
                    const secret = 'xoxb-mask-test-token';
                    const added = (await call(
                        'chatAccountAdd',
                        {
                            account: {
                                platform: 'slack',
                                accountAlias: alias,
                                accountStatus: 'disabled',
                                workspace: 'mask-test',
                                botToken: secret,
                                signingSecret: 'mask-test-secret',
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                            },
                        },
                        $meta,
                    )) as {account?: {accountId?: string}};
                    const accountId = added?.account?.accountId;
                    assert.ok(accountId, 'the account is created through the same route');
                    // A client names the record by what the route gave it, which for a binary key is
                    // the base64 the read hands back (`@@T-625`).
                    const keyOf = (): string => String(accountId);

                    try {
                        const page = (await call(
                            'chatAccountFind',
                            {
                                filterBy: {accountAlias: alias},
                                paging: {pageNumber: 1, pageSize: 5, count: true},
                            },
                            $meta,
                        )) as {items?: Array<Record<string, unknown>>};
                        const listed = page.items?.[0];
                        assert.ok(listed, 'the row is in the list');
                        assert.equal(
                            listed.botToken,
                            CREDENTIAL_MASK,
                            'and its token reads as the mask, not as the token',
                        );
                        assert.equal(
                            listed.signingSecret,
                            CREDENTIAL_MASK,
                            'as does the signing secret beside it',
                        );

                        const key = String(listed.accountId);
                        const record = (await call('chatAccountGet', {accountId: key}, $meta)) as {
                            account?: Record<string, unknown>;
                        };
                        assert.equal(
                            record.account?.botToken,
                            secret,
                            'while the single record answers the value the form needs',
                        );

                        // A save that sends the mask back — a client that filled its form from the
                        // list — must not overwrite the token with dots.
                        await call(
                            'chatAccountEdit',
                            {
                                account: {
                                    accountId: key,
                                    accountAlias: alias,
                                    botToken: CREDENTIAL_MASK,
                                    signingSecret: CREDENTIAL_MASK,
                                },
                            },
                            $meta,
                        );
                        const after = (await call('chatAccountGet', {accountId: key}, $meta)) as {
                            account?: Record<string, unknown>;
                        };
                        assert.equal(
                            after.account?.botToken,
                            secret,
                            'and a masked save leaves the stored token alone',
                        );
                    } finally {
                        await call('chatAccountRemove', {accountId: keyOf()}, $meta);
                    }
                },

                async function theStorybookFixtureMatchesTheTables(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // The pages are developed and reviewed against a fixture, not a database: a row
                    // whose columns are not the table's is a Storybook page that renders a shape no
                    // server would ever answer.
                    const fixture = (await call('chatFixture', {}, $meta)) as Record<
                        string,
                        Array<Record<string, unknown>>
                    >;
                    const accounts = fixture?.['chat.account'] ?? [];
                    const workspaces = fixture?.['chat.workspace'] ?? [];
                    assert.ok(accounts.length > 0, 'the fixture serves accounts to the mock adapter');
                    assert.ok(workspaces.length > 0, 'and workspaces beside them');
                    assert.ok(
                        accounts.every(account => typeof account.accountAlias === 'string'),
                        'each account row is named by the alias the table keys on',
                    );
                    assert.ok(
                        accounts.every(account => typeof account.workspace === 'string'),
                        'and names the workspace whose pair maintains it',
                    );
                    assert.ok(
                        workspaces.every(workspace => typeof workspace.configToken === 'string'),
                        'each workspace row carries the configuration pair',
                    );
                },

                async function theTableSchemaIsWhatThePagesDraw(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // A browse page asks for the object's schema before it can draw a column, so the
                    // answer has to carry the object the model named — a schema derived from an object
                    // this realm does not declare is a page with no columns.
                    const enriched = (await call(
                        'subjectObjectSchema',
                        {subject: 'chat', object: 'account'},
                        $meta,
                    )) as {properties?: Record<string, unknown>};
                    const described = enriched?.properties?.account as
                        | {properties?: Record<string, unknown>}
                        | undefined;
                    assert.ok(described, 'the account object is described');
                    assert.ok(
                        described?.properties?.accountAlias,
                        'with the columns the browse page shows',
                    );
                },
            ]),
    };
});
