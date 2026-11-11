import {test} from 'tap';

import {
    chatAccountColumns,
    chatAccountOfRow,
    chatWorkspaceColumns,
    chatWorkspaceOfRow,
} from './account.ts';

/**
 * The two directions between the tables and the shapes a port reads.
 *
 * The differences are what break a deployment when they are got wrong: an absent string is `null` in
 * the table and *absent* on the account (a key holding `null` would shadow the workspace's pair
 * downstream), and the API base is `apiUrl` in one shape and `url` in the other. The configuration
 * pair is not on the account at all (`@@D-797`).
 */

test('a row becomes the account a port reads', t => {
    t.same(
        chatAccountOfRow({
            accountId: 'a1',
            accountAlias: 'blong-bot',
            platform: 'slack',
            workspace: 'feasible',
            appId: 'A1',
            clientId: 'C1',
            botToken: 'xoxb-1',
            signingSecret: 'shh',
            apiUrl: 'https://slack.com/api/',
            publicUrl: 'https://chat.example',
            accountStatus: 'enabled',
        }),
        {
            workspace: 'feasible',
            appId: 'A1',
            clientId: 'C1',
            botToken: 'xoxb-1',
            signingSecret: 'shh',
            url: 'https://slack.com/api/',
            publicUrl: 'https://chat.example',
        },
        'the columns an account runs with, with the API base under the name the port reads',
    );

    t.same(chatAccountOfRow({}), {}, 'an empty row answers an empty account, not null keys');
    t.same(
        chatAccountOfRow({workspace: null, appId: '', botToken: 42}),
        {},
        'a null column, an empty string and a number all answer absent, because a null would shadow ' +
            'what the workspace supplies',
    );

    t.equal(
        chatAccountOfRow({authToken: 'viber-token'}).authToken,
        'viber-token',
        'a Viber account carries its auth token and no app ids',
    );
    t.equal(
        'accountId' in chatAccountOfRow({accountId: 'a1', accountAlias: 'x'}),
        false,
        'and the identity stays in the row rather than on the account a port matches by alias',
    );
    t.end();
});

test('a workspace row becomes the pair a port resolves onto its accounts', t => {
    const at = new Date('2026-11-10T00:00:00.000Z');
    t.same(
        chatWorkspaceOfRow({
            workspaceName: 'feasible',
            configToken: 'xoxe.xoxp-1-pair',
            configRefreshToken: 'xoxe-1-pair',
            configTokenExpiresAt: at,
        }),
        {
            configToken: 'xoxe.xoxp-1-pair',
            configRefreshToken: 'xoxe-1-pair',
            configTokenExpiresAt: at.toISOString(),
        },
        'the pair travels, and a timestamp column travels as the ISO string an account carries',
    );
    t.same(
        chatWorkspaceOfRow({workspaceName: 'feasible', configToken: '', configRefreshToken: null}),
        {},
        'a workspace with no pair answers no fields, which is what a port reads as "nothing to renew"',
    );
    t.equal(
        chatWorkspaceOfRow({configTokenExpiresAt: '2026-11-10T00:00:00.000Z'}).configTokenExpiresAt,
        '2026-11-10T00:00:00.000Z',
        'a driver that answers strings is read the same way',
    );
    t.end();
});

test('a patch becomes the columns it names, and nothing else', t => {
    t.same(
        chatAccountColumns({workspace: 'w', appId: 'A2', botToken: 'xoxb-2'}),
        {workspace: 'w', appId: 'A2', botToken: 'xoxb-2'},
        'only the fields the caller named are written, so a rotation leaves the secrets alone',
    );
    t.same(
        chatAccountColumns({signingSecret: null, publicUrl: null}),
        {signingSecret: null, publicUrl: null},
        'a null clears a column, which is not the same as not naming it',
    );
    t.same(
        chatAccountColumns({url: 'https://slack.test/api/'}),
        {apiUrl: 'https://slack.test/api/'},
        'the port’s own name for the API base is the column its row calls one',
    );
    t.same(
        chatAccountColumns({accountStatus: 'disabled', accountAlias: 'ignored'}),
        {accountStatus: 'disabled'},
        'the alias is the address rather than a column, so a patch that repeats it writes nothing',
    );
    t.end();
});

test('a workspace patch turns the rotation’s answer into columns', t => {
    t.same(
        chatWorkspaceColumns({configToken: 'xoxe.xoxp-2', configRefreshToken: 'xoxe-1-2'}),
        {configToken: 'xoxe.xoxp-2', configRefreshToken: 'xoxe-1-2'},
        'a renewal writes the pair it was given',
    );
    t.same(
        chatWorkspaceColumns({configToken: null, workspaceStatus: 'disabled'}),
        {configToken: null, workspaceStatus: 'disabled'},
        'and a null clears the token, which is how a spent pair is retired',
    );

    // The rotation answers epoch *seconds*, and `new Date(seconds)` reads a number as milliseconds —
    // the year 1970, which the maintenance pass then treats as long expired every start.
    const seconds = 1794362701;
    const stored = chatWorkspaceColumns({configTokenExpiresAt: seconds})
        .configTokenExpiresAt as Date;
    t.equal(
        stored.toISOString(),
        new Date(seconds * 1000).toISOString(),
        'epoch seconds become the timestamp the column holds',
    );
    const iso = chatWorkspaceColumns({configTokenExpiresAt: '2026-12-01T00:00:00.000Z'})
        .configTokenExpiresAt as Date;
    t.equal(
        iso.toISOString(),
        '2026-12-01T00:00:00.000Z',
        'and an ISO string is read as the moment it names',
    );
    t.equal(
        chatWorkspaceColumns({configTokenExpiresAt: 'not a date'}).configTokenExpiresAt,
        null,
        'an unreadable expiry stores null, which a port reads as "not due" rather than as 1970',
    );
    t.end();
});
