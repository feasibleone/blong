/**
 * `LukaotLog` is the framework's `ILog` written through lukaot (`@@T-715`).
 *
 * What these assertions pin is the translation, because that is the whole of this class: the
 * framework's `(fields, message)` order against lukaot's `(message, fields)`, the `$meta` envelope
 * becoming the two header fields the renderer lifts, a declared identifier reaching the same writer,
 * and a face that only carries the members its threshold allows.
 *
 * The destination is a collector rather than stdout: the logger takes a `writer` for exactly this,
 * and replacing `process.stdout.write` for the duration would swallow the test runner's own output.
 */

import {test} from 'tap';

import {createConfigProxy} from './ConfigRuntime.ts';
import LukaotLog from './LukaotLog.ts';

/** A run's records, parsed from the JSON lines they were written as. */
function collector() {
    const lines: string[] = [];
    const writer = {
        write: (line: string) => {
            lines.push(line);
        },
    };
    return {
        writer,
        records: (): Array<Record<string, unknown>> =>
            lines
                .join('')
                .split('\n')
                .filter(line => line.trim().startsWith('{'))
                .map(line => JSON.parse(line) as Record<string, unknown>),
    };
}

/** The bag a record carries, which is where lukaot puts everything but the header. */
const fields = (record: Record<string, unknown> | undefined): Record<string, unknown> =>
    (record?.fields ?? {}) as Record<string, unknown>;

test('a level call is written through lukaot, in the framework order', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'info', service: 'suite', writer});
    log.logger('info', {name: 'watch'}).info?.({file: 'a.ts'}, 'the file changed');
    const [record] = records();
    t.equal(record?.msg, 'the file changed', 'the sentence is the message');
    t.equal(fields(record).context, 'watch', 'the component is the context');
    t.equal(record?.service, 'suite', 'the service rides on every record');
    t.equal(fields(record).file, 'a.ts', 'the bag keeps its fields');
    t.end();
});

test('the $meta envelope becomes the two header fields', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'info', writer});
    log.logger('info', {}).info?.({$meta: {mtid: 'event', method: 'watch.config.reload'}}, 'm');
    const [record] = records();
    t.equal(record?.messageId, 'event');
    t.equal(record?.operation, 'watch.config.reload');
    t.equal(fields(record).$meta, undefined, 'the envelope is moved, not duplicated');
    t.end();
});

test('a declared identifier reaches the same writer', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'debug', writer});
    log.signalFor('watch')?.frameworkWatchFailed?.({error: 'gone'});
    const [record] = records();
    t.equal(fields(record).signal, 'frameworkWatchFailed', 'the identifier is on the record');
    t.equal(record?.msg, 'file watch failed: gone', 'the declaration renders the sentence');
    t.equal(fields(record).context, 'watch', 'through the component the view was bound to');
    t.same(fields(record).params, {error: 'gone'}, 'the values travel as params');
    t.end();
});

test('a face carries every member, and the threshold decides what is written', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'info', writer});
    const face = log.logger('warn', {name: 'quiet'});
    t.type(face.warn, 'function');
    // The member exists at every level, because that is what a level face promised before this
    // implementation existed — and because a demoted call (`adapter.error()` sending an expected failure
    // to `debug`) must reach the logger rather than find no method at all.
    t.type(face.info, 'function', 'the members are all there');
    face.info?.({}, 'filtered');
    t.equal(records().length, 0, 'and the logger filters what its threshold excludes');
    t.type(face.calls, 'object', 'the call channel is there at every level');
    t.end();
});

test('child answers pino-shape, because that is what ILog promises', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'info', writer});
    const child = log.child({name: 'rpc'}, {level: 'warn'}) as unknown as {
        warn: (bag: object, message: string) => void;
    };
    child.warn({statusCode: 503}, 'unavailable');
    const [record] = records();
    t.equal(record?.msg, 'unavailable');
    t.equal(fields(record).context, 'rpc', 'the binding names the component');
    t.end();
});

test('a runtime level change reaches the faces built afterwards', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'info', writer});
    log.setLevel('warn');
    // The face is asked for at the process default, which the change has already moved: a component
    // that named no level of its own follows the process, exactly as it did under pino.
    const quiet = log.logger(undefined, {name: 'quiet'});
    quiet.info?.({}, 'filtered by the new threshold');
    quiet.warn?.({}, 'kept');
    t.equal(records().length, 1, 'the warn line is the only one');
    t.end();
});

test('silent is a threshold above every level', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({format: 'json', level: 'silent', writer});
    log.logger('silent', {name: 'quiet'}).error?.({}, 'not written');
    t.equal(records().length, 0);
    t.end();
});

test('a capture renders at the rung the configuration names, for the methods it names', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {frameworkHttpExchange: {level: 'headers', when: {method: ['db/*', '*.find']}}},
    });
    const capture = log.captureFor('http');
    t.type(capture?.http, 'function', 'the declared shape is reachable by its family');
    let built = 0;
    const exchange = () => {
        built += 1;
        return {
            phase: 'request' as const,
            method: 'POST',
            url: 'https://host/accounts',
            headers: {authorization: 'Bearer abcdefghijkl', accept: 'json'},
        };
    };
    capture?.http?.({method: 'chat.postMessage'}, exchange);
    t.equal(built, 0, 'a method the policy does not name builds nothing');
    capture?.http?.({method: 'db.subject.find'}, exchange);
    t.equal(built, 1, 'a named method builds the payload once');
    const [record] = records();
    t.equal(fields(record).capture, 'frameworkHttpExchange');
    t.equal(fields(record).rung, 'headers', 'the configured rung, not the declared default');
    t.equal(fields(record).headers, 'authorization, accept', 'names shown, values withheld');
    t.equal(record?.msg, 'http exchange', 'the declaration is the sentence');
    t.end();
});

test('a capture the configuration does not ask for is off, and builds nothing', async t => {
    const {writer} = collector();
    const log = new LukaotLog({format: 'json', level: 'info', writer, capture: {}});
    const capture = log.captureFor('http');
    t.type(capture?.http, 'function', 'the member exists — the declaration does');
    // The framework's three captures are declared `enabled: false`, because a payload is something an
    // operator asks for. Saying nothing keeps them off, and the payload is never built.
    let built = 0;
    capture?.http?.({method: 'x'}, () => {
        built += 1;
        return {phase: 'response' as const, statusCode: 200};
    });
    t.equal(built, 0, 'an unconfigured capture is off');
    t.end();
});

test('the configuration turns a capture on, whether the declaration says so or not', async t => {
    // The declaration is a default, not a verdict: `enabled: false` in the source is what the
    // framework ships, and the operator who wants the payload says `enabled: true` in the process's
    // configuration. Before this held, the surface returned before asking the configuration, so the
    // flag reached a member that had already given up and nothing was recorded or said (@@F-770).
    const {writer, records} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {frameworkHttpExchange: {enabled: true, level: 'line'}},
    });
    let built = 0;
    log.captureFor('http')?.http?.({method: 'POST'}, () => {
        built += 1;
        return {phase: 'request' as const, method: 'POST', url: 'https://host/x', headers: {}};
    });
    t.equal(built, 1, 'the declared-off capture runs because the configuration asked for it');
    t.equal(records().length, 1, 'and one record is written');
    t.equal(fields(records()[0])['capture'], 'frameworkHttpExchange');
    t.end();
});

test('the configuration turns a capture off, whatever the declaration says', async t => {
    const {writer} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {frameworkHttpExchange: {enabled: false, level: 'body'}},
    });
    let built = 0;
    log.captureFor('http')?.http?.({method: 'POST'}, () => {
        built += 1;
        return {phase: 'request' as const, method: 'POST', url: 'https://host/x', headers: {}};
    });
    t.equal(built, 0, 'the payload is not even built');
    t.end();
});

test('a capture can be enabled for one adapter instance and left off for the others', async t => {
    // The requirement's grain is the adapter *instance*, not its type: a deployment turns a capture on
    // for the one adapter it is debugging, and the other instances of the same adapter pay nothing —
    // not a payload, not a rendered shape (@@D-924). The instance is the id the framework assembles
    // the port with, `<realm>.<layer>`, which is what the record's `context` already said.
    const {writer, records} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {
            frameworkHttpExchange: {enabled: true, level: 'line', when: {instance: 'srv.http'}},
        },
    });
    let other = 0;
    log.captureFor('srv.http')?.http?.({method: 'POST'}, () => {
        return {phase: 'request' as const, method: 'POST', url: 'https://host/x', headers: {}};
    });
    log.captureFor('chat.http')?.http?.({method: 'POST'}, () => {
        other += 1;
        return {phase: 'request' as const, method: 'POST', url: 'https://host/y', headers: {}};
    });
    t.equal(other, 0, 'the instance the policy does not name builds nothing');
    t.equal(records().length, 1, 'the named instance records once');
    t.equal(
        fields(records()[0])['context'],
        'srv.http',
        'and the record says which instance it came through',
    );
    t.end();
});

test('an instance pattern may cover a realm or an adapter type', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {frameworkHttpExchange: {enabled: true, when: {instance: ['srv.*', '*.tcp']}}},
    });
    for (const instance of ['srv.db', 'srv.http', 'demo.tcp', 'chat.http'])
        log.captureFor(instance)?.http?.({method: 'POST'}, () => ({phase: 'request' as const}));
    t.same(
        records().map(record => fields(record)['context']),
        ['srv.db', 'srv.http', 'demo.tcp'],
        'a glob selects a realm or an adapter type, and only what it matches',
    );
    t.end();
});

test('each instance may carry its own rule, keyed by its id under `when`', async t => {
    // The grain an operator asks for: this adapter captures everything, that one nothing, the rest of
    // the realm one operation, and everything else one half of the exchange. Writing the keys is what
    // makes the list the rule — an instance nobody names takes no capture (@@D-925).
    const {writer, records} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {
            frameworkHttpExchange: {
                enabled: true,
                when: {
                    'srv.http': true,
                    'srv.db': false,
                    'srv.*': {method: ['chat.*']},
                    '*': {phase: ['response']},
                },
            },
        },
    });
    const take = (instance: string, method: string, phase: 'request' | 'response'): void => {
        log.captureFor(instance)?.http?.({method, phase}, () => ({phase}));
    };
    take('srv.http', 'anything.at.all', 'request');
    take('srv.db', 'anything.at.all', 'request');
    take('srv.subject', 'chat.postMessage', 'request');
    take('srv.subject', 'db.subject.find', 'request');
    take('chat.http', 'anything.at.all', 'request');
    take('chat.http', 'anything.at.all', 'response');

    t.same(
        records().map(record => fields(record)['context']),
        ['srv.http', 'srv.subject', 'chat.http'],
        'the literal id beats the glob, the glob beats `*`, and a named-off instance stays off',
    );
    t.end();
});

test('a rule may raise the rung for its own instance', async t => {
    const {writer, records} = collector();
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        capture: {
            frameworkHttpExchange: {
                enabled: true,
                level: 'line',
                when: {'srv.http': {level: 'headers'}},
            },
        },
    });
    log.captureFor('srv.http')?.http?.({method: 'POST'}, () => ({
        phase: 'request' as const,
        method: 'POST',
        url: 'https://host/x',
        headers: {accept: 'json'},
    }));
    t.equal(
        fields(records()[0])['rung'],
        'headers',
        'the instance renders at the rung its own rule names',
    );
    t.end();
});

test('a capture taken while a handler factory runs does not read the live config', async t => {
    // The loader arms the runtime's factory-phase guard around every handler factory call, and a
    // capture may be taken during one — a port that reports while it is being assembled, a schema
    // factory that exercises the adapter. Reading `capture[id].enabled` off the live proxy then threw
    // `Config hot-reload anti-pattern: 'enabled' is a primitive…` instead of recording (@@F-771), so the
    // policy is copied when the log is built and read from that copy.
    const {writer} = collector();
    const {proxy, enterConfig, exitConfig} = createConfigProxy({
        capture: {frameworkHttpExchange: {enabled: false, level: 'body'}},
    });
    const log = new LukaotLog({format: 'json', level: 'info', writer, ...proxy});
    enterConfig();
    try {
        t.doesNotThrow(
            () => log.captureFor('http')?.http?.({method: 'POST'}, () => ({phase: 'request'})),
            'the capture answers without tripping the guard',
        );
    } finally {
        exitConfig();
    }
    t.end();
});

test('a payload past the inline threshold is retained and referenced, not inlined', async t => {
    const {writer, records} = collector();
    const kept: string[] = [];
    const payloads = {
        putPayload: async (id: string) => {
            kept.push(id);
        },
        putPayloadSync: (id: string) => {
            kept.push(id);
        },
        getPayload: async () => undefined,
        payloadStats: () => ({size: 0, dropped: 0}),
    };
    const log = new LukaotLog({
        format: 'json',
        level: 'info',
        writer,
        payloads,
        capture: {frameworkHttpExchange: {level: 'body'}},
    });
    const body = 'x'.repeat(4096);
    log.captureFor('http')?.http?.({method: 'POST'}, () => ({
        phase: 'response' as const,
        statusCode: 200,
        url: 'https://host/x',
        body,
    }));
    const [record] = records();
    // The record keeps the value; what changes is the *reference*, which the renderer prints in its
    // place — a JSON reader has the store's index under `refs.payloads`, a human line has the link.
    const index = (record?.refs as {payloads?: Record<string, string>} | undefined)?.payloads;
    t.ok(index?.payload, 'the bulky field earned a payload reference');
    t.equal(fields(record).bytes, body.length, 'and its size is still reported');
    await new Promise(resolve => setTimeout(resolve, 60));
    t.equal(kept.length, 1, 'the bulk was handed to the store');
    t.end();
});

test('a human line shows the reference where the payload was', async t => {
    const lines: string[] = [];
    const log = new LukaotLog({
        format: 'human',
        level: 'info',
        writer: {write: (line: string) => lines.push(line)},
        payloads: {
            putPayload: async () => undefined,
            putPayloadSync: () => undefined,
            getPayload: async () => undefined,
            payloadStats: () => ({size: 0, dropped: 0}),
        },
        capture: {frameworkHttpExchange: {level: 'body'}},
    });
    log.captureFor('http')?.http?.({method: 'POST'}, () => ({
        phase: 'response' as const,
        statusCode: 200,
        url: 'https://host/x',
        body: 'y'.repeat(4096),
    }));
    t.ok(
        lines.join('').includes('lukaot://p/'),
        'the line names the payload rather than printing it',
    );
    t.end();
});
