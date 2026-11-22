import {test} from 'tap';
import {Type} from 'typebox';
import Value from 'typebox/value';

import {fieldOf, invalidFields, problemsOf} from './gatewayValidation.ts';

/**
 * A refused request says which fields, in the shape a form reads (`@@D-957`).
 *
 * TypeBox reports a failure as a path and a sentence, and the gateway's validator used to throw the
 * sentence away into a plain `Error`: the client received \"internal server error\" for a body it
 * could have fixed, and the process wrote an unhandled-error record for a caller's mistake. These are
 * the three conversions that turn the report into an answer — the path as a field name, one message per
 * field, and the one-line summary a log record carries.
 */

const schema = Type.Object({
    isActive: Type.Boolean(),
    subject: Type.Object({name: Type.String()}),
});

test('a TypeBox path is a field name', t => {
    t.equal(fieldOf('/isActive'), 'isActive', 'a top-level member is its own name');
    t.equal(fieldOf('/subject/name'), 'subject.name', 'a nested one is dotted');
    t.equal(
        fieldOf('/'),
        '',
        'the value itself has no field, which a form reads as the whole record',
    );
    t.equal(fieldOf(undefined), '', 'and a report that names no path is the same case');
    t.end();
});

test('the failures are the fields that were wrong, one message each', t => {
    const errors = [...Value.Errors(schema, {isActive: 'yes', subject: {name: 7}})];
    t.ok(errors.length >= 2, 'the schema reports both members');
    const fields = invalidFields(errors);
    t.same(
        fields.map(({field}) => field).sort(),
        ['isActive', 'subject.name'],
        'and the answer names them the way a form keys its inputs',
    );
    t.equal(
        fields.length,
        new Set(fields.map(({field}) => field)).size,
        'one message per field, because a form paints one beside each input',
    );
    for (const {message} of fields)
        t.ok(message.length > 0, 'and every one of them says something');

    const summary = problemsOf(fields);
    t.match(summary, /isActive: /, 'the log line names the first field');
    t.match(summary, /subject\.name: /, 'and the second');
    t.notMatch(summary, /\n/, 'on one line, because it travels in a message');
    t.end();
});

test('a value that matches the schema has no fields to report', t => {
    t.same(
        invalidFields(Value.Errors(schema, {isActive: true, subject: {name: 'ok'}})),
        [],
        'the same conversion answers nothing when nothing is wrong',
    );
    t.equal(problemsOf([]), '', 'and the summary is empty rather than a stray separator');
    t.end();
});
