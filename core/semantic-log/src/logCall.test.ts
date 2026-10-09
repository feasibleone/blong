import t from 'tap';
import {toLogCall} from './logCall.ts';

// Every shape a pino-shaped caller uses has to reach the emitter's record model
// intact: the emitter takes a message *and* a field bag, the call sites wrote
// against pino, and the translation between the two is the whole of this module.

t.test('the canonical pino order puts the text beside the bag', t => {
    t.same(toLogCall([{database: 'blong'}, 'created missing database']), {
        msg: 'created missing database',
        fields: {database: 'blong'},
    });
    t.end();
});

t.test('an error as the only argument rides the slot the emitter renders', t => {
    const call = toLogCall([new Error('connection timeout')]);
    t.equal(call.msg, 'connection timeout');
    t.equal(call.fields.err instanceof Error, true);
    t.end();
});

t.test('a bag with no text still produces a record', t => {
    t.same(toLogCall([{plain: true}]), {msg: '', fields: {plain: true}});
    // A bag whose text is the `message` property is the emitter's own shorthand.
    t.same(toLogCall([{message: 'shorthand', rest: 1}]), {msg: 'shorthand', fields: {rest: 1}});
    t.same(toLogCall([{msg: 'shorthand', rest: 1}]), {msg: 'shorthand', fields: {rest: 1}});
    t.same(toLogCall([{a: 1}, {b: 2}]), {msg: '', fields: {a: 1, b: 2}});
    t.end();
});

t.test('a bare message needs no bag', t => {
    t.same(toLogCall(['hello']), {msg: 'hello', fields: {}});
    t.end();
});

t.test('a printf-style call keeps its values and names its caller', t => {
    // `@fastify/bearer-auth` refuses a request with `('unauthorized: %s', error.message)`,
    // and a translation that read only the first argument printed the placeholder and lost
    // the reason — a line that said nothing about what went wrong or who logged it. The
    // framework's own call sites never write this shape, so the record says where it came
    // from rather than leaving that to be searched for.
    const call = toLogCall(['unauthorized: %s', 'missing authorization header']);
    t.equal(call.msg, 'unauthorized: missing authorization header', 'the value reaches the line');
    t.match(String(call.fields.site), /logCall\.test/, 'and the caller is named');

    t.equal(toLogCall(['a %s and %d', 'x', 2]).msg, 'a x and 2', 'every placeholder is filled');
    t.equal(
        toLogCall(['nothing to fill', 'extra']).msg,
        'nothing to fill extra',
        'a value with no placeholder is appended, as the logger would',
    );
    t.equal(toLogCall(['%s%%', 5]).msg, '5%', 'a literal percent survives');
    t.equal(
        toLogCall(['%s %j', 'json', {a: 1}]).msg,
        'json {"a":1}',
        'and an object among the values is substituted, not dropped',
    );
    // Nothing in this file may throw: a value with no JSON form is text, not an exception.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    t.equal(toLogCall(['%j', cyclic]).msg, '[object Object]', 'a value with no JSON form is text');
    t.end();
});

t.test('a bag beside the text is fields when the text asks for no value', t => {
    // The distinction the branch above rests on: pino's canonical `(text, bag)` order, which a
    // message with no placeholder in it keeps.
    t.same(toLogCall(['created', {database: 'blong'}]), {
        msg: 'created',
        fields: {database: 'blong'},
    });
    t.end();
});

t.test('callSite names the caller of the messages it matches', t => {
    // A list of patterns rather than a switch: the interesting line is usually one particular
    // message, and naming the caller of every record buries it. A substring is a regular
    // expression that matches itself, so that is how one is written.
    const callSite = ['created missing', /unauthorized/];
    const match = toLogCall([{database: 'blong'}, 'created missing database'], {callSite});
    t.match(String(match.fields.site), /logCall\.test/, 'a matching message names its caller');
    t.equal(match.msg, 'created missing database', 'and its message is unchanged');
    t.same(
        toLogCall([{database: 'blong'}, 'created the database'], {callSite}).fields,
        {database: 'blong'},
        'a message that matches nothing is emitted exactly as it was',
    );
    t.match(
        String(toLogCall([{msg: 'unauthorized: nope'}], {callSite}).fields.site),
        /logCall\.test/,
        'an expression among the patterns is honoured',
    );
    t.match(
        String(toLogCall([{msg: 'an array ['}], {callSite: ['[']}).fields.site),
        /logCall\.test/,
        'and one that is not an expression is looked for as the text it is',
    );
    t.same(toLogCall([{a: 1}], {callSite: []}).fields, {a: 1}, 'an empty list names nobody');
    t.end();
});

t.test('the shapes that are none of the above still produce a line', t => {
    // Nothing here may throw: the last resort is `String(first)`, so an unexpected
    // argument costs a readable line rather than the logging path itself.
    t.same(toLogCall([undefined]), {msg: '', fields: {}});
    t.same(toLogCall([]), {msg: '', fields: {}});
    t.same(toLogCall([42]), {msg: '42', fields: {}});
    t.end();
});

t.test('the slots the emitter lifts are carried through untouched', t => {
    // `operation` and `messageId` are already the emitter's own slots, so a caller
    // that sets them is not rewritten into a field bag.
    const call = toLogCall([{operation: 'subject.subjectModelList', messageId: 'request', id: 7}]);
    t.equal(call.fields.operation, 'subject.subjectModelList');
    t.equal(call.fields.messageId, 'request');
    t.equal(call.fields.id, 7);
    t.end();
});
