/**
 * Tests for what `blong-dev call` decides before it sends anything.
 *
 * The command's whole surface is the merge: which server the method resolves to, and which payload the
 * call carries once the file's defaults and the command line's own parts are put together. Reading the
 * plan rather than the network is what makes that checkable — a live call is only as good as the
 * request it produced.
 */
import {test} from 'tap';

import type {ICallRc} from '../callRc.ts';
import {guardBooleans, planCall} from './call.ts';

const rc: ICallRc = {
    server: {local: {url: 'http://localhost:8080'}, chat: {url: 'https://chat.example'}},
    route: {'chat.': 'chat'},
    payload: {
        'chat.': {platform: 'slack', account: 'blong-bot'},
        'chat.prompt.ask': {kind: 'text', conversationId: 'C0'},
    },
    username: 'testAdmin',
    password: 'testPassword',
};

test('the payload the file declares is the base the command line merges onto', async t => {
    const plan = planCall(['chat.prompt.ask', '{text: Deploy?}'], rc);

    t.equal(plan.method, 'chat.prompt.ask', 'the method reaches the gateway dotted');
    t.equal(plan.server, 'chat', 'the route names the server');
    t.equal(plan.url, 'https://chat.example', 'and carries its address');
    t.same(
        plan.payload,
        {platform: 'slack', account: 'blong-bot', kind: 'text', conversationId: 'C0', text: 'Deploy?'},
        'the file fills what the call did not say',
    );
});

test('a dotted flag overrides the file at one path and leaves the rest', async t => {
    const plan = planCall(
        ['chatPromptAsk', '--payload.conversationId=C1', '--payload.paging.pageSize=10'],
        rc,
    );

    t.equal(plan.method, 'chat.prompt.ask', 'the joined handler name is read as the method');
    t.same(
        plan.payload,
        {
            platform: 'slack',
            account: 'blong-bot',
            kind: 'text',
            conversationId: 'C1',
            paging: {pageSize: 10},
        },
        'a flag wins over the file, and a nested path is created',
    );
});

test('the positional payload wins over a flag that sets the same path', async t => {
    const plan = planCall(['chat.prompt.ask', '{text: from-the-call}', '--payload.text=from-the-flag'], rc);

    t.equal(plan.payload.text, 'from-the-flag', 'the flag is the last word, as it is written last');
});

test('a method that no route covers needs a server named', async t => {
    t.throws(
        () => planCall(['access.user.find'], rc),
        /cannot tell which server "access.user.find" goes to/,
        'two servers and no route is a refusal rather than a guess',
    );
    t.equal(
        planCall(['access.user.find', '--server', 'local'], rc).url,
        'http://localhost:8080',
        '--server answers it',
    );
});

test('the file decides which routes travel in the clear, and --plain overrides it', async t => {
    const plainRc: ICallRc = {...rc, plain: ['chat.prompt']};

    t.equal(planCall(['chat.prompt.ask', '{text: hi}'], plainRc).plain, true, 'a listed route is plain');
    t.equal(planCall(['chat.prompt.ask', '{text: hi}'], rc).plain, false, 'an unlisted one is encrypted');
    t.equal(
        planCall(['chat.prompt.ask', '{text: hi}', '--plain'], rc).plain,
        true,
        '--plain sends it in the clear whatever the file says',
    );
});

test('a command line that is not a call is reported, not guessed at', async t => {
    t.throws(() => planCall([], rc), /a method name is required/, 'no method is no call');
    t.throws(
        () => planCall(['chat.prompt.ask', '{a: b}', 'extra'], rc),
        /unexpected argument "extra"/,
        'a second payload is a mistake worth reporting',
    );
});

test('a login call is public, and --dry-run never reaches the network', async t => {
    const plan = planCall(
        ['login.token.create', '{username: a, password: b}', '--server=chat', '--dry-run'],
        rc,
    );

    t.equal(plan.public, true, 'login travels on the handshake keys');
    t.equal(plan.dryRun, true, 'and a dry run is recorded in the plan');
});

test('a boolean flag does not eat the argument after it', async t => {
    t.same(
        guardBooleans(['chat.prompt.ask', '--dry-run', '{text: hi}']),
        ['chat.prompt.ask', '--dry-run=true', '{text: hi}'],
        'the payload after --dry-run stays a positional',
    );
    t.same(guardBooleans(['--server=local']), ['--server=local'], 'a flag with a value is left alone');
    t.equal(
        planCall(['chat.prompt.ask', '--dry-run', '{text: hi}'], rc).payload.text,
        'hi',
        'and the call keeps its payload',
    );
});
