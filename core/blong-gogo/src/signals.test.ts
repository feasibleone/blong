import { declare } from '@feasibleone/lukaot';
import { test } from 'tap';

import { attachSignals, type ISignalHost } from './signals.ts';

/**
 * The vocabulary a port's handlers call.
 *
 * What is pinned is the seam itself: a declaration reaches a handler as `this.signal.<identifier>`, a
 * log signal writes one line at the level the declaration named, and an error signal *returns* the
 * failure the caller throws — which is what lets `throw this.signal?.x?.()` and `throw errors.x()` be
 * the same statement. The record is written by the same call that produces the failure, so a thrown
 * error is observable without a second line of code.
 */

/** A port with a level-bound logger, which is all `attachSignals` needs. */
function host() {
    const lines: Array<{level: string; bindings: object; message: string}> = [];
    const record = (level: string) => (bindings: object, message: string) => {
        lines.push({level, bindings, message});
    };
    const port: ISignalHost = {
        log: {
            trace: record('trace'),
            debug: record('debug'),
            info: record('info'),
            warn: record('warn'),
            error: record('error'),
            fatal: record('fatal'),
        },
    };
    return {port, lines};
}

const vocabulary = declare({
    log: {
        fixtureSkipped: {level: 'warn', message: 'row {id} was skipped: {reason}'},
    },
    error: {
        fixtureMissing: {message: 'row {id} is gone', statusCode: 404},
    },
});

test('a declared log signal writes one line at its level', t => {
    const {port, lines} = host();
    attachSignals(port, [vocabulary]);

    port.signal?.fixtureSkipped?.({id: 'r1', reason: 'empty'});

    t.equal(lines.length, 1, 'one call, one line');
    t.equal(lines[0]?.level, 'warn', 'at the level the declaration named');
    t.equal(lines[0]?.message, 'row r1 was skipped: empty', 'with the values filled in');
    t.same(lines[0]?.bindings, {
        signal: 'fixtureSkipped',
        params: {id: 'r1', reason: 'empty'},
    }, 'and the identifier a reader greps for, with the values beside it');
    t.end();
});

test('a declared error signal returns the failure, and records it once', t => {
    const {port, lines} = host();
    attachSignals(port, [vocabulary]);

    const thrown = port.signal?.fixtureMissing?.({id: 'r1'});

    t.equal((thrown as {type?: string}).type, 'fixtureMissing', 'the declared identifier is its type');
    t.equal((thrown as {statusCode?: number}).statusCode, 404, 'and it carries the declared status');
    t.equal((thrown as {message?: string}).message, 'row r1 is gone');
    t.equal(lines.length, 1, 'the record was written by the same call');
    t.equal(lines[0]?.level, 'error', 'at the level an error signal defaults to');
    t.end();
});

test('a port whose layer declared nothing gets no signal at all', t => {
    const {port, lines} = host();
    attachSignals(port, []);
    t.equal(port.signal, undefined, 'so `this.signal?.x?.()` in its code is a no-op');
    t.same(lines, [], 'and it writes nothing');
    t.end();
});

test('two declarations compose, and a repeated name is refused', t => {
    const {port} = host();
    const second = declare({log: {fixtureOther: {message: 'other'}}});
    attachSignals(port, [vocabulary, second]);
    t.ok(port.signal?.fixtureSkipped, 'the first vocabulary is reachable');
    t.ok(port.signal?.fixtureOther, 'and so is the second');

    t.throws(
        () => attachSignals(host().port, [vocabulary, vocabulary]),
        /declared twice/,
        'while one name declared twice is a mistake, not an override',
    );
    t.end();
});

test('the realm config raises, samples and switches a signal without touching source', t => {
    const {port, lines} = host();
    attachSignals(port, [vocabulary], {
        // Every identifier of a namespace, the way an operator quiets a noisy area.
        fixture: {level: 'debug'},
    });

    port.signal?.fixtureSkipped?.({id: 'r1', reason: 'empty'});
    t.equal(lines[0]?.level, 'debug', 'the policy level replaced the declared one');

    const off = host();
    attachSignals(off.port, [vocabulary], {fixtureSkipped: {enabled: false}});
    t.equal(off.port.signal?.fixtureSkipped, undefined, 'a disabled signal is absent from the proxy');
    t.end();
});

test('a policy that names no declared signal is reported, not silently ignored', t => {
    const {port, lines} = host();
    attachSignals(port, [vocabulary], {renamedAway: {level: 'debug'}});

    const warnings = lines.filter(line => line.level === 'warn');
    t.equal(warnings.length, 1, 'the mistake is said out loud');
    t.match(
        warnings[0]?.message,
        /policy names no declared signal: renamedAway/,
        'and it names the key, so the operator can find it',
    );
    t.ok(port.signal?.fixtureSkipped, 'while the vocabulary still works');
    t.end();
});

test('an undeclared identifier is absent rather than throwing', t => {
    const {port} = host();
    attachSignals(port, [vocabulary]);
    // The property read is what a call site does before calling, so this is the exact behaviour a
    // handler relies on: `this.signal?.notDeclared?.()` is a no-op, not a crash.
    t.equal(port.signal?.notDeclared, undefined);
    t.notOk('notDeclared' in (port.signal ?? {}), 'and the identifier is not a key of the vocabulary');
    t.end();
});
