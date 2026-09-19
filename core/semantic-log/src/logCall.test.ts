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
