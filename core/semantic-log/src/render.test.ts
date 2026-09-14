import t from 'tap';
import {renderHuman, renderJson} from './render.ts';
import type {LogRecord} from './record.ts';

const base: LogRecord = {
    id: '01J8Z9K2M9PQRSTVWXYZ0A1B2C',
    time: 1757765472345,
    level: 30,
    levelName: 'info',
    msg: 'quote accepted',
    service: 'hub',
    context: 'quote',
    messageId: 'msg-7',
    operation: 'quote.create',
    refs: {record: '01J8Z9K2M9PQRSTVWXYZ0A1B2C', template: 'tpl_9f3a', trace: 'tr-1'},
};

t.test('a record with no optional detail renders as exactly one line', t => {
    const line = renderHuman({...base, messageId: undefined, operation: undefined, refs: {record: base.id}}, {
        color: false,
    });
    t.equal(line.split('\n').length, 1, 'PRD R20 acceptance');
    t.end();
});

t.test('the header carries the listed details in a greppable order', t => {
    const line = renderHuman(base, {color: false});
    // The date is asserted by shape, not by day: `base.time` is a fixed
    // timestamp used only to make the output deterministic.
    t.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z info {2}hub quote msg-7 quote\.create quote accepted/);
    t.end();
});

t.test('references are appended and are dereferenceable', t => {
    const line = renderHuman(base, {color: false});
    t.match(line, /r=semantic-log:\/\/record\/01J8Z9K2M9PQRSTVWXYZ0A1B2C/);
    t.match(line, /t=semantic-log:\/\/template\/tpl_9f3a/);
    t.match(line, /x=semantic-log:\/\/trace\/tr-1/);
    t.end();
});

t.test('a forged parent id cannot add a second reference to the group', t => {
    // `refs.parent` renders as a bare id, but `renderHuman` is public over any
    // `LogRecord` and the inspect CLI re-renders records read back from a store,
    // so the id is untrusted text. Unencoded, this one closes the reference
    // group and forges a record reference; the segment is encoded by the same
    // rule the `semantic-log://` members use, so it cannot.
    const line = renderHuman(
        {...base, refs: {...base.refs, parent: 'x] [r=semantic-log://record/ATTACKER'}},
        {color: false},
    );
    t.match(
        line,
        /p=x%5D%20%5Br%3Dsemantic-log%3A%2F%2Frecord%2FATTACKER/,
        'the parent segment is percent-encoded, leaving the group intact',
    );
    t.notMatch(line, /r=semantic-log:\/\/record\/ATTACKER/, 'no forged reference was rendered');
    t.equal(line.split('\n').length, 1, 'and the header stays one line');
    t.end();
});

t.test('a payload index for a value that is not large inlines instead (PRD R19 threshold)', t => {
    // The renderer re-checks the threshold rather than trusting the index: an
    // index entry alone is a marker, not a size rule, and a record assembled by
    // hand (or by a build that measured a different value) could name a payload
    // for a short field. Hiding a short value behind a reference that shortens
    // nothing is the failure this guards, so the value must stay inline.
    const line = renderHuman(
        {
            ...base,
            refs: {...base.refs, payloads: {short: '01J8Z9K2M9PQRSTVWXYZ0A1B2C'}},
            fields: {short: 'tiny'},
        },
        {color: false},
    );
    t.match(line, /^ {2}short: tiny$/m, 'the value is inlined, not replaced');
    t.notMatch(line, /semantic-log:\/\/payload\//, 'no reference is rendered for it');
    t.end();
});

t.test('a payload index for a large value renders the reference instead (PRD R19/R20)', t => {
    // The other side of the same rule, asserted on the renderer alone: with the
    // index present *and* the text past the threshold, the value is replaced by
    // its reference. This is what lets a hand-built record be rendered honestly
    // without running the writer.
    const line = renderHuman(
        {
            ...base,
            refs: {...base.refs, payloads: {big: '01J8Z9K2M9PQRSTVWXYZ0A1B2D'}},
            fields: {big: 'z'.repeat(1024)},
        },
        {color: false},
    );
    t.match(line, /^ {2}big: semantic-log:\/\/payload\/01J8Z9K2M9PQRSTVWXYZ0A1B2D$/m);
    t.notMatch(line, /z{1024}/, 'the value is not inlined');
    t.end();
});

t.test('request and response render as labelled indented blocks, never a raw dump', t => {
    const line = renderHuman(
        {
            ...base,
            req: {operation: 'POST', target: '/quotes', headers: {'content-type': 'application/json'}},
            res: {status: 201, headers: {'x-trace': 'tr-1'}, elapsedMs: 42},
        },
        {color: false},
    );
    const body = line.split('\n');
    t.ok(body.length >= 3, 'multi-line when detail is present');
    t.match(line, /\n\s+request {2}POST \/quotes/);
    t.match(line, /\n\s+content-type: application\/json/);
    t.match(line, /\n\s+response {2}201 \(42ms\)/);
    t.notMatch(line, /\[object Object\]/);
    t.end();
});

t.test('absent details are absent, not empty', t => {
    const line = renderHuman({...base, req: undefined, res: undefined}, {color: false});
    t.notMatch(line, /request/);
    t.notMatch(line, /response/);
    t.end();
});

t.test('error type, message and stack render as a block', t => {
    const line = renderHuman(
        {...base, level: 50, levelName: 'error', err: {type: 'Error', message: 'timeout', stack: 'Error: timeout\n    at f (/app/a.ts:1:2)'}},
        {color: false},
    );
    t.match(line, /\n\s+error {2}Error: timeout/);
    t.match(line, /\n\s+at f \(\/app\/a\.ts:1:2\)/);
    t.end();
});

t.test('flow and intent render on the header line', t => {
    const line = renderHuman(
        {...base, flow: {id: 'flow-1', kind: 'transfer.single', step: 'quote', index: 1, status: 'running'}, intent: {name: 'User_Checkout'}},
        {color: false},
    );
    t.match(line, /flow=flow-1\/quote#1/);
    t.match(line, /intent=User_Checkout/);
    t.end();
});

t.test('color is opt-in and off by default', t => {
    const plain = renderHuman(base, {color: false});
    t.notMatch(plain, /\u001B\[/);
    t.match(renderHuman(base, {color: true}), /\u001B\[/);
    t.end();
});

t.test('json rendering carries the record verbatim', t => {
    const parsed = JSON.parse(renderJson(base)) as LogRecord;
    t.equal(parsed.id, base.id);
    t.equal(parsed.msg, 'quote accepted');
    t.equal(parsed.refs.trace, 'tr-1');
    t.equal(renderJson(base), JSON.stringify(base), 'an ordinary record is serialised byte-identically');
    t.end();
});

t.test('json rendering survives a circular reference and a BigInt in fields', t => {
    const circular: Record<string, unknown> = {name: 'loop'};
    circular.self = circular;
    const shared: Record<string, unknown> = {name: 'reused'};
    const text = renderJson({
        ...base,
        fields: {circular, count: 9007199254740993n, first: shared, second: shared},
    });
    const parsed = JSON.parse(text) as {id: string; fields: Record<string, unknown>};
    t.equal(parsed.id, base.id, 'the record is still emitted in full');
    t.equal((parsed.fields.circular as Record<string, unknown>).name, 'loop');
    t.equal((parsed.fields.circular as Record<string, unknown>).self, '[Circular]', 'the cycle is marked');
    t.equal(parsed.fields.count, '9007199254740993', 'the BigInt keeps its exact value');
    t.same(parsed.fields.first, {name: 'reused'}, 'a shared value is not mistaken for a cycle');
    t.same(parsed.fields.second, {name: 'reused'});
    t.equal(text.split('\n').length, 1, 'still one line, one object per record');
    t.end();
});

t.test('fields that cannot be serialised render without throwing', t => {
    const circular: Record<string, unknown> = {name: 'loop'};
    circular.self = circular;
    const line = renderHuman({...base, fields: {circular, count: 9007199254740993n}}, {color: false});
    t.match(line, /\n\s+circular: \[unserializable\]/, 'a circular reference is replaced by an explicit marker');
    t.match(line, /\n\s+count: \[unserializable\]/, 'a BigInt is replaced by an explicit marker');
    t.end();
});

t.test('fields with no text form are skipped rather than printed as undefined', t => {
    const line = renderHuman({...base, fields: {keep: 'yes', blank: undefined}}, {color: false});
    t.match(line, /\n\s+keep: yes/);
    t.notMatch(line, /blank/);
    t.notMatch(line, /undefined/);
    t.end();
});

t.test('colour defaults to off when no options are supplied', t => {
    // `renderHuman(record)` is the zero-configuration call: colour is off rather
    // than left undefined.
    t.notMatch(renderHuman(base), /\u001B\[/);
    t.end();
});

t.test('an unknown level prints its raw value instead of a colour', t => {
    const line = renderHuman({...base, level: 99, levelName: '99'}, {color: false});
    t.match(line, / 99\s+hub/, 'the raw numeric level stands in for the name');
    t.end();
});

t.test('a flow with no position yet renders its placeholders', t => {
    const line = renderHuman({...base, flow: {id: 'flow-1', kind: 'transfer.single', status: 'running'}}, {color: false});
    t.match(line, /flow=flow-1\/-#-1/, 'an unstarted step and an unset index are shown');
    t.end();
});

t.test('a response without a duration omits the parenthesised time', t => {
    const line = renderHuman({...base, res: {status: 204}}, {color: false});
    t.match(line, /\n\s+response {2}204$/);
    t.end();
});

t.test('a field with no JSON text form is marked, not printed as undefined', t => {
    // A `toJSON` returning `undefined` makes `JSON.stringify` return `undefined`
    // for a value that is neither undefined, a function nor a symbol: the marker
    // is what keeps the line readable.
    const line = renderHuman({...base, fields: {gone: {toJSON: () => undefined}}}, {color: false});
    t.match(line, /\n\s+gone: \[unserializable\]/);
    t.end();
});

t.test('a decision renders as its own labelled block', t => {
    const line = renderHuman(
        {
            ...base,
            decision: {
                discriminator: 'route',
                chosen: 'fast',
                candidates: ['fast', 'slow'],
                values: {amount: 10},
            },
        },
        {color: false},
    );
    t.match(line, /\n\s+decision {2}route -> fast \(of fast, slow\)/);
    t.end();
});

t.test('a redaction-collapsed decision renders without joining a string', t => {
    // A `redact` pattern can replace the whole rationale with the `[redacted]`
    // placeholder (`decision`, `**`) or only its candidate list
    // (`decision.candidates`). The renderer used to destructure the slot and
    // call `candidates.join`, throwing a `TypeError` out of the log call.
    const whole = renderHuman({...base, decision: '[redacted]'} as unknown as LogRecord, {color: false});
    t.match(whole, /\n\s+decision {2}\[redacted\]/, 'a wholly withheld rationale keeps its placeholder');
    const candidates = renderHuman(
        {...base, decision: {discriminator: 'route', chosen: 'fast', candidates: '[redacted]', values: {}}} as unknown as LogRecord,
        {color: false},
    );
    t.match(
        candidates,
        /\n\s+decision {2}route -> fast$/,
        'the surviving fields render and the collapsed candidate list is omitted',
    );
    t.end();
});

t.test('a non-numeric timestamp renders an explicit marker, not a wrong date', t => {
    // `new Date('[redacted]').toISOString()` throws a `RangeError`; a withheld
    // timestamp is shown as a marker instead. A non-finite number is the same
    // failure, so it shares the marker.
    t.match(
        renderHuman({...base, time: '[redacted]'} as unknown as LogRecord, {color: false}),
        /^\[time withheld\] /,
        'a withheld timestamp is marked',
    );
    t.match(renderHuman({...base, time: Number.NaN}, {color: false}), /^\[time withheld\] /, 'a non-finite timestamp is marked too');
    t.end();
});

t.test('json rendering is unaffected by a collapsed decision or timestamp', t => {
    // `renderJson` serialises whatever the record holds, so it never assumed a
    // `Decision` or a numeric instant in the first place.
    const record = {...base, time: '[redacted]', decision: '[redacted]'} as unknown as LogRecord;
    t.doesNotThrow(() => renderJson(record));
    const parsed = JSON.parse(renderJson(record)) as {time: unknown; decision: unknown};
    t.equal(parsed.time, '[redacted]');
    t.equal(parsed.decision, '[redacted]');
    t.end();
});

t.test('json rendering survives a value whose toJSON throws', t => {
    // The replacer handles cycles and BigInt, but it only ever sees the values
    // `JSON.stringify` hands it — and `toJSON` runs before that. A throw here
    // used to escape the whole log call, including `fatal` in json mode, where
    // it escapes the process-failure handler and aborts Node instead of
    // reporting the failure. The render is total: it reports the record through
    // a minimal reconstructed object.
    const hostile = {
        toJSON: (): never => {
            throw new Error('toJSON exploded');
        },
    };
    const record = {...base, fields: {hostile}};
    let text = '';
    t.doesNotThrow(() => void (text = renderJson(record)), 'a logging call must never throw');
    const parsed = JSON.parse(text) as {service: string; msg: string; id: string};
    t.equal(parsed.service, 'hub', 'the reconstructed record still names the service');
    t.equal(parsed.msg, 'quote accepted', 'and still carries the message');
    t.ok(parsed.id, 'and the reference');
    t.end();
});

t.test('a throwing getter in the fields bag cannot escape the human render', t => {
    const fields: Record<string, unknown> = {keep: 'yes'};
    Object.defineProperty(fields, 'bad', {
        enumerable: true,
        get: (): never => {
            throw new Error('getter exploded');
        },
    });
    let line = '';
    t.doesNotThrow(() => void (line = renderHuman({...base, fields}, {color: false})));
    t.match(line, /quote accepted/, 'the record is reported through the reconstructed line');
    t.end();
});

t.test('an escape sequence in an error message does not reach the rendered block', t => {
    // A stack routinely embeds the message, so an escape sequence in a failure
    // arrived at the error block through the frames even though the message line
    // was sanitised. The whole rendered form is free of C0 controls: a reviewer
    // reading a record a hostile input built cannot be moved around the
    // terminal by it.
    const line = renderHuman(
        {
            ...base,
            level: 50,
            levelName: 'error',
            err: {
                type: 'Error',
                message: 'boom \u001B[31mred',
                stack: 'Error: boom \u001B[31mred\n    at f (/app/a.ts:1:2)\u001B]8;;http://evil.example\u0007',
            },
        },
        {color: false},
    );
    t.ok(
        line.split('\n').every(rendered => !/[\u0000-\u001F\u007F]/.test(rendered)),
        'no C0 control character survives inside any rendered line',
    );
    // The ESC is replaced by a space (`sanitise`), and the message already had a
    // space before it, so the neutralised text reads `boom  [31mred` with two
    // spaces. The text is still reported — only the control character that could
    // move the cursor has gone; deleting the text is not what neutralising means.
    t.match(line, /\n\s+error {2}Error: boom {2}\[31mred/, 'the message text is still reported, neutralised');
    t.match(line, /\n\s+at f \(\/app\/a\.ts:1:2\)/, 'and so are the frames');
    t.end();
});

t.test('a salvage payload keeps the level numeric and names it', t => {
    // The last-resort payload has to match the shape of a normal json record:
    // the number under `level`, the name under `levelName`. It used to write the
    // name under `level`, so a consumer parsing that key as a number read
    // `"info"`. A `redact` pattern can replace the level slot, and a level that
    // no longer resolves is reported as `info` rather than as `undefined`.
    const hostile = {
        toJSON: (): never => {
            throw new Error('toJSON exploded');
        },
    };
    const replaced = JSON.parse(renderJson({...base, level: '[redacted]' as unknown as number, fields: {hostile}})) as {
        level: unknown;
        levelName: unknown;
    };
    t.equal(replaced.level, 30, 'a level that no longer resolves falls back to info');
    t.equal(replaced.levelName, 'info', 'and is named in levelName');
    const numeric = JSON.parse(renderJson({...base, fields: {hostile}})) as {level: unknown; levelName: unknown};
    t.equal(numeric.level, 30, 'a numeric level is carried as a number');
    t.equal(numeric.levelName, 'info', 'with its name alongside, as a normal record does');
    t.end();
});

t.test('a record whose message cannot even be read still renders a line', t => {
    const record = {...base};
    Object.defineProperty(record, 'msg', {
        enumerable: true,
        get: (): never => {
            throw new Error('msg exploded');
        },
    });
    const line = renderHuman(record, {color: false});
    t.match(line, /\[unreadable\]/, 'the unreadable message is marked, not thrown');
    t.match(line, /hub/, 'and the rest of the reconstructed line survives');
    t.end();
});

t.test('an out-of-range timestamp renders a marker instead of throwing', t => {
    // `new Date(1e18).toISOString()` throws a `RangeError` out of the log call.
    // The render boundary catches it and marks the timestamp, rather than
    // letting a bad clock abort the process the record describes.
    const line = renderHuman({...base, time: 1e18}, {color: false});
    t.match(line, /^\[time withheld\] /, 'the unrenderable timestamp is marked');
    t.match(line, /quote accepted/, 'the record itself is still reported');
    t.end();
});

t.test('a message containing a newline stays on the single header line', t => {
    const line = renderHuman(
        {...base, messageId: undefined, operation: undefined, refs: {record: base.id}, msg: 'first\nsecond'},
        {color: false},
    );
    t.equal(line.split('\n').length, 1, 'PRD R20: the header is one greppable line');
    t.match(line, /first second/, 'the newline is neutralised, not printed');
    t.end();
});

t.test('a field cannot forge a labelled block line', t => {
    const line = renderHuman(
        {...base, fields: {request: 'FORGED', note: 'ok\n  request  POST /evil'}},
        {color: false},
    );
    t.match(line, /^ {2}request: FORGED$/m, 'a field named request renders as a field line');
    t.notMatch(line, /^ {2}request {2}/m, 'no line is left looking like the request block label');
    t.equal(line.split('\n').length, 3, 'the injected newline did not add a line');
    t.end();
});
