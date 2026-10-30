import fastify, {type FastifyRequest} from 'fastify';
import {test} from 'tap';

import {
    type IWebhookBehaviour,
    type IWebhookRequest,
    webhookAnswer,
    webhookBodyParser,
    webhookMemory,
    webhookRemember,
} from './webhook.ts';

/**
 * The receiving half of the webhook port.
 *
 * What is asserted here is the part a live platform cannot conveniently prove: which hook runs when,
 * what the HTTP answer is in each mode, and that a body is still the bytes its signature was computed
 * over. The posting half is unchanged and covered by the ports that use it.
 */

const request = (body: unknown, raw = JSON.stringify(body)): IWebhookRequest => ({
    method: 'POST',
    path: '/chat/slack/A1/T1',
    query: {},
    params: {appId: 'A1', clientId: 'T1'},
    headers: {'content-type': 'application/json'},
    rawBody: Buffer.from(raw),
    body,
});

const behaviour = (overrides: Partial<IWebhookBehaviour> = {}): IWebhookBehaviour => ({
    hook: 'slackIn',
    mode: 'reply',
    response: {code: 200, body: 'EVENT_RECEIVED'},
    traceId: () => 'trace',
    ...overrides,
});

test('the chain runs identity, message, destination and server in order', async t => {
    const calls: string[] = [];
    const message = {type: 'text', text: 'hello'};
    const answer = await webhookAnswer(
        request({type: 'event_callback'}),
        {
            identity: async (incoming, $meta) => {
                calls.push($meta.method!);
                t.same(incoming.params, {appId: 'A1', clientId: 'T1'}, 'the path params travel');
                return {account: 'demo'};
            },
            message: async (_request, $meta) => {
                calls.push($meta.method!);
                t.equal(
                    ($meta as unknown as {auth?: {account?: string}}).auth?.account,
                    'demo',
                    'the identity the signature proved travels as auth',
                );
                return message;
            },
            server: async (context, $meta) => {
                calls.push($meta.method!);
                t.same(context.message, message, 'the server hook sees the message');
                t.same(context.result, {sent: true}, 'and what the destination answered');
                return {code: 200, body: {ok: true}};
            },
        },
        behaviour({
            destination: 'chat.in.message.receive',
            dispatch: async (dispatched, $meta) => {
                calls.push($meta.method!);
                t.same(dispatched, message, 'the message is what the destination receives');
                return {sent: true};
            },
        }),
        webhookMemory(),
    );

    t.same(
        calls,
        ['slackIn.identity', 'slackIn.message', 'chat.in.message.receive', 'slackIn.server'],
        'the four steps run in the order the contract names',
    );
    t.same(answer.response, {code: 200, body: {ok: true}}, 'the server hook shapes the answer');
    t.equal(answer.detached, undefined, 'reply mode has nothing detached');
    t.end();
});

test('a refused identity rejects before any message is read', async t => {
    const refusal = Object.assign(new Error('The Slack signature does not match'), {
        statusCode: 401,
        type: 'chat.signatureInvalid',
    });
    let messaged = false;
    await t.rejects(
        webhookAnswer(
            request({type: 'event_callback'}),
            {
                identity: async () => {
                    throw refusal;
                },
                message: async () => {
                    messaged = true;
                    return {type: 'text'};
                },
            },
            behaviour(),
            webhookMemory(),
        ),
        refusal,
        'the error is the one the hook threw, so the route can answer with its status',
    );
    t.equal(messaged, false, 'and no payload was interpreted');
    t.end();
});

test('a message the hook disowns is answered by the server hook', async t => {
    const answer = await webhookAnswer(
        request({type: 'url_verification', challenge: 'abc'}),
        {
            identity: async () => ({}),
            message: async () => false,
            server: async context => ({code: 200, body: {challenge: context.request.body}}),
        },
        behaviour({
            destination: 'chat.in.message.receive',
            dispatch: async () => t.fail('no dispatch'),
        }),
        webhookMemory(),
    );
    t.same(
        answer.response,
        {code: 200, body: {challenge: {type: 'url_verification', challenge: 'abc'}}},
        'the challenge is answered from what arrived',
    );
    t.end();
});

test('server mode acknowledges from the config and runs the destination on', async t => {
    let delivered: unknown;
    const answer = await webhookAnswer(
        request({type: 'event_callback'}),
        {
            identity: async () => ({}),
            message: async () => ({type: 'text', text: 'hello'}),
        },
        behaviour({
            mode: 'server',
            response: {code: 200, body: {ok: true}},
            destination: 'chat.in.message.receive',
            dispatch: async message => {
                delivered = message;
                return 'done';
            },
        }),
        webhookMemory(),
    );
    t.same(answer.response, {code: 200, body: {ok: true}}, 'the configured answer is the ack');
    await answer.detached;
    t.same(delivered, {type: 'text', text: 'hello'}, 'and the message still reached the realm');
    t.end();
});

test('the acknowledge hook decides the answer before the realm runs', async t => {
    let delivered: unknown;
    const answer = await webhookAnswer(
        request({payload: '{"type":"view_submission"}'}),
        {
            identity: async () => ({}),
            acknowledge: async (incoming, $meta) => {
                t.equal(
                    $meta.method,
                    'slackIn.acknowledge',
                    'the hook is named after the port, so a port without one keeps the config',
                );
                t.same(
                    incoming.body,
                    {payload: '{"type":"view_submission"}'},
                    'it reads the request and not the realm',
                );
                return {code: 200, body: {response_action: 'clear'}};
            },
            message: async () => ({kind: 'answer'}),
        },
        behaviour({
            mode: 'server',
            destination: 'chat.in.receive',
            dispatch: async message => {
                delivered = message;
            },
        }),
        webhookMemory(),
    );
    t.same(
        answer.response,
        {code: 200, body: {response_action: 'clear'}},
        'the hook overrides the configured EVENT_RECEIVED',
    );
    await answer.detached;
    t.same(delivered, {kind: 'answer'}, 'and the message still reaches the realm after the ack');
    t.end();
});

test('a repeated delivery is acknowledged without being processed twice', async t => {
    const memory = webhookMemory();
    let processed = 0;
    const hooks = {
        identity: async () => ({requestId: 'Ev123'}),
        message: async () => {
            processed += 1;
            return {type: 'text'};
        },
    };
    const first = await webhookAnswer(
        request({type: 'event_callback'}),
        hooks,
        behaviour(),
        memory,
    );
    const second = await webhookAnswer(
        request({type: 'event_callback'}),
        hooks,
        behaviour(),
        memory,
    );

    t.equal(processed, 1, 'the platform retry is not a second message');
    t.same(first.response, {code: 200, body: 'EVENT_RECEIVED'}, 'the first is answered');
    t.same(second.response, {code: 200, body: 'EVENT_RECEIVED'}, 'and so is the retry');
    t.end();
});

test('a duplicate is answered in the shape its payload asks for', async t => {
    const memory = webhookMemory();
    let processed = 0;
    const hooks = {
        identity: async () => ({requestId: 'Ev124'}),
        acknowledge: async () => ({code: 200, body: {response_action: 'clear'}}),
        message: async () => {
            processed += 1;
            return {kind: 'answer'};
        },
    };
    const interaction = request({payload: '{"type":"view_submission"}'});
    const first = await webhookAnswer(interaction, hooks, behaviour({mode: 'server'}), memory);
    const second = await webhookAnswer(interaction, hooks, behaviour({mode: 'server'}), memory);

    t.equal(processed, 1, 'the retry is not processed again');
    t.same(
        second.response,
        first.response,
        'and the answer a person sees does not change because Slack retried',
    );
    t.end();
});
test('the delivery memory keeps only the newest ids', t => {
    const memory = webhookMemory(2);
    t.equal(webhookRemember(memory, 'a'), false, 'the first id is new');
    t.equal(webhookRemember(memory, 'b'), false, 'the second is new');
    t.equal(webhookRemember(memory, 'a'), true, 'the first is remembered while it fits');
    t.equal(webhookRemember(memory, 'c'), false, 'the third arrives');
    t.equal(webhookRemember(memory, 'b'), true, 'the oldest was evicted, the newest two are kept');
    t.equal(webhookRemember(memory, undefined), false, 'an id-less request is never a duplicate');
    t.end();
});

test('a body keeps the bytes a signature is computed over', async t => {
    const app = fastify();
    try {
        app.addContentTypeParser(
            'application/json',
            {parseAs: 'buffer'},
            webhookBodyParser('json'),
        );
        app.addContentTypeParser(
            'application/x-www-form-urlencoded',
            {parseAs: 'buffer'},
            webhookBodyParser('form'),
        );
        app.post('/hook', async request => ({
            raw: (request as FastifyRequest & {rawBody?: Buffer}).rawBody?.toString('utf8'),
            body: request.body,
        }));

        const jsonPayload = '{"type":"event_callback","event":{"text":"hi"}}';
        const json = await app.inject({
            method: 'POST',
            url: '/hook',
            payload: jsonPayload,
            headers: {'content-type': 'application/json'},
        });
        t.same(
            json.json(),
            {raw: jsonPayload, body: {type: 'event_callback', event: {text: 'hi'}}},
            'JSON is parsed and its bytes are kept byte for byte',
        );

        const formPayload = 'payload=%7B%22actions%22%3A%5B%5D%7D';
        const form = await app.inject({
            method: 'POST',
            url: '/hook',
            payload: formPayload,
            headers: {'content-type': 'application/x-www-form-urlencoded'},
        });
        t.same(
            form.json(),
            {raw: formPayload, body: {payload: '{"actions":[]}'}},
            'a form is a name/value record beside the same bytes',
        );

        const broken = await app.inject({
            method: 'POST',
            url: '/hook',
            payload: '{"type":',
            headers: {'content-type': 'application/json'},
        });
        t.equal(broken.statusCode, 400, 'a body that is not JSON is refused by the parser');
    } finally {
        await app.close();
    }
    t.end();
});
