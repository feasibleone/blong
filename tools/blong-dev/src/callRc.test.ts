/**
 * Tests for `.blong_callrc` — the rules that decide where a call goes and what it sends.
 *
 * These are the decisions `blong-dev call` makes before it touches the network, and they are the ones
 * a person is puzzled by when a call goes to the wrong gateway or arrives without a parameter: which
 * alias a method belongs to, which defaults a payload starts from, and how the command line is merged
 * over them. No HTTP is involved, so the whole resolution is read directly.
 */
import {test} from 'tap';

import {
    credentialsOf,
    defaultPayload,
    matchByKey,
    mergePayload,
    methodName,
    parsePayload,
    payloadFlag,
    plainOf,
    resolveServer,
    setPath,
    type ICallRc,
} from './callRc.ts';

const rc: ICallRc = {
    server: {
        local: {url: 'http://localhost:8080', username: 'localUser', password: 'localSecret'},
        chat: {url: 'https://chat.example', username: 'chatUser'},
        bare: {url: 'https://bare.example'},
    },
    route: {
        'chat.': 'chat',
        'chat.prompt.': 'chat',
        'access.': 'local',
    },
    payload: {
        'chat.': {platform: 'slack', account: 'blong-bot'},
        'chat.prompt.ask': {kind: 'text', conversationId: 'C0'},
    },
    username: 'fileUser',
    password: 'fileSecret',
};

test('a method is read in the three forms a person writes it in', async t => {
    t.equal(methodName('chat.prompt.ask'), 'chat.prompt.ask', 'a dotted method is already the wire name');
    t.equal(methodName('chat/prompt/ask'), 'chat.prompt.ask', 'a path is the same method');
    t.equal(
        methodName('chatPromptAsk'),
        'chat.prompt.ask',
        'the joined handler name splits on its capitals, which is how the three words join',
    );
    t.throws(() => methodName('chatPrompt'), /cannot read/, 'a name that is not three words is refused');
    t.throws(() => methodName('  '), /a method name is required/, 'an empty name is refused');
});

test('the payload is read as JSON when it is JSON, and as YAML otherwise', async t => {
    t.same(parsePayload('{"a": 1}'), {a: 1}, 'JSON keeps its numbers');
    t.same(parsePayload('{a: b, c: 2}'), {a: 'b', c: 2}, 'a compact YAML mapping needs no quoted keys');
    t.same(parsePayload('{text: "Which one?"}'), {text: 'Which one?'}, 'a YAML string keeps its quotes out');
    t.equal(parsePayload('   '), undefined, 'an empty payload is no payload');
    t.throws(() => parsePayload('[1, 2]'), /mapping of parameters/, 'a list is not a payload');
    t.throws(() => parsePayload('{a: b'), /cannot read the payload/, 'a broken document is reported');
});

test('a payload flag reaches a dotted path, and its value keeps its type', async t => {
    t.same(payloadFlag('payload.text', 'hello'), {path: 'text', value: 'hello'}, 'text stays text');
    t.same(payloadFlag('payload.pageSize', '10'), {path: 'pageSize', value: 10}, 'a number is a number');
    t.same(payloadFlag('payload.public', 'true'), {path: 'public', value: true}, 'a boolean is a boolean');
    t.equal(payloadFlag('server', 'local'), undefined, 'another option is not a payload');

    const payload: Record<string, unknown> = {paging: {page: 1}};
    setPath(payload, 'paging.pageSize', 25);
    t.same(payload, {paging: {page: 1, pageSize: 25}}, 'a path adds to what is already there');
    setPath(payload, 'filter.name.first', 'Ann');
    t.same(
        payload.filter,
        {name: {first: 'Ann'}},
        'a path that is not there yet is created one level at a time',
    );
    t.throws(() => setPath(payload, '', 1), /payload key is required/, 'an unnamed path is refused');
});

test('merging keeps what the earlier payloads said, and lets the later one win', async t => {
    t.same(
        mergePayload({a: 1, nested: {x: 1, y: 2}}, {b: 2, nested: {y: 3}}, undefined),
        {a: 1, b: 2, nested: {x: 1, y: 3}},
        'objects merge key by key, and a missing payload is skipped',
    );
    t.same(mergePayload({a: {b: 1}}, {a: 2}), {a: 2}, 'anything that is not an object replaces');
});

test('a route is the exact key, then the longest prefix', async t => {
    t.same(matchByKey({'chat.': 1, 'chat.prompt.': 2}, 'chat.prompt.ask'), {key: 'chat.prompt.', value: 2}, 'the longest prefix wins');
    t.same(matchByKey({'chat.prompt.ask': 3, 'chat.': 1}, 'chat.prompt.ask'), {key: 'chat.prompt.ask', value: 3}, 'an exact key beats a prefix');
    t.equal(matchByKey({'chat.': 1}, 'chart.find'), undefined, 'a prefix only matches on a dot boundary');
    t.equal(matchByKey(undefined, 'chat.prompt.ask'), undefined, 'a file with no routes matches nothing');
});

test('a default payload is the prefix defaults under the method own', async t => {
    t.same(
        defaultPayload(rc, 'chat.prompt.ask'),
        {platform: 'slack', account: 'blong-bot', kind: 'text', conversationId: 'C0'},
        'the realm defaults come first, and the method overrides them',
    );
    t.same(
        defaultPayload(rc, 'chat.channel.find'),
        {platform: 'slack', account: 'blong-bot'},
        'a method with no defaults of its own starts from its prefix',
    );
    t.same(defaultPayload(rc, 'access.user.find'), {}, 'an unrouted method starts empty');
});

test('the server is the flag, the route, the default, the target, or the only one', async t => {
    t.equal(resolveServer(rc, {method: 'chat.prompt.ask'}).alias, 'chat', 'the longest route names the server');
    t.equal(resolveServer(rc, {method: 'access.user.find'}).alias, 'local', 'another prefix names another server');
    t.equal(
        resolveServer(rc, {method: 'chat.prompt.ask', alias: 'local'}).alias,
        'local',
        '--server overrides the route',
    );
    t.equal(
        resolveServer({...rc, route: undefined, default: {server: 'bare'}}, {method: 'chat.prompt.ask'})
            .entry.url,
        'https://bare.example',
        'a method with no route falls back to default.server',
    );
    t.equal(
        resolveServer(
            {...rc, route: undefined, server: {only: {url: 'http://only'}}},
            {method: 'x.y.z'},
        ).alias,
        'only',
        'a file with one server needs no route',
    );
    t.equal(
        resolveServer({...rc, route: undefined}, {method: 'x.y.z', target: 'http://one-off'}).entry.url,
        'http://one-off',
        '--target calls a gateway the file never mentions',
    );
});

test('a call that cannot pick a server says so, and lists what it could pick', async t => {
    t.throws(
        () => resolveServer({...rc, route: undefined}, {method: 'x.y.z'}),
        /cannot tell which server "x.y.z" goes to — name one with --server \(local, chat, bare\)/,
        'several servers and no route names them',
    );
    t.throws(
        () => resolveServer({}, {method: 'x.y.z'}),
        /no server to call — write one in \.blong_callrc/,
        'an empty file points at the file it should have been',
    );
    t.throws(
        () => resolveServer(rc, {method: 'x.y.z', alias: 'nowhere'}),
        /no server "nowhere" with a url \(--server\) — this file declares: local, chat, bare/,
        'an alias the file does not declare is reported with the ones it does',
    );
});

test('a route the gateway serves without auth has its params sent in the clear', async t => {
    const withPlain: ICallRc = {...rc, plain: ['chat.prompt', 'chat.in']};

    t.equal(plainOf(withPlain, 'chat.prompt.ask'), true, 'a listed prefix covers the method');
    t.equal(plainOf(withPlain, 'chat.in.receive'), true, 'and so does a shorter one');
    t.equal(plainOf(withPlain, 'chat.account.find'), false, 'a method nobody listed is encrypted');
    t.equal(plainOf(withPlain, 'chat.prompted.find'), false, 'a prefix only matches on a dot boundary');
    t.equal(plainOf({...rc, plain: true}, 'chat.account.find'), true, 'true keeps asking for every method');
    t.equal(plainOf(rc, 'chat.prompt.ask'), false, 'a file that says nothing encrypts');
});

test('credentials come from the server, then the file, then the environment', async t => {
    t.same(
        credentialsOf(rc, rc.server?.local ?? {}, {}),
        {username: 'localUser', password: 'localSecret'},
        'a server with its own credentials uses them',
    );
    t.same(
        credentialsOf(rc, rc.server?.bare ?? {}, {}),
        {username: 'fileUser', password: 'fileSecret'},
        'a server without credentials falls back to the file',
    );
    t.same(
        credentialsOf({}, {}, {MLE_USERNAME: 'envUser', MLE_PASSWORD: 'envSecret'}),
        {username: 'envUser', password: 'envSecret'},
        'with no file the environment answers, which is how proxy worked before the file',
    );
    t.same(credentialsOf({}, {}, {}), {}, 'nothing configured means no credentials');
});
