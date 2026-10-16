/**
 * Tests for the verdict a failure gets.
 *
 * The cases are the two failures of build #622 and the one the previous run makes possible: a
 * timeout that reads as a hang, the same timeout on a package that had passed in the run before
 * (which is what makes it a runner budget rather than broken code), a leg that published nothing,
 * and a failure no evidence explains — which has to stay `unknown` rather than become a guess.
 */
import {test} from 'tap';

import {legGapVerdict, verdictFor} from './classify.ts';
import type {IRunComparison} from './types.ts';

function previous(overrides: Partial<IRunComparison> = {}): IRunComparison {
    return {
        run: 621,
        status: 'passed',
        counts: {total: 14, passed: 14, failed: 0, flaky: 0, skipped: 0, todo: 0},
        testsMs: 27_000,
        source: 'page',
        ...overrides,
    };
}

test('a timeout on a package that had passed is a budget, not a broken test', t => {
    const verdict = verdictFor(
        {
            test: 'index.test.ts › a group › timeout!',
            message: 'timeout: the run\u2019s own budget expired',
        },
        previous(),
    );

    t.equal(verdict?.kind, 'timeout-under-load', 'the kind');
    t.match(verdict?.reason, /passed in #621 \(27s of tests\)/, 'the numbers it rests on');
    t.match(
        verdict?.reason,
        /the runner was slower rather than the code broken/,
        'and the reading',
    );
    t.end();
});

test('the expiry is read from the raw stream when the message is empty', t => {
    // blong-cli in #622: tap was killed mid-file, so the report named no failing test and the
    // stream is the only place the expiry appears.
    const verdict = verdictFor(
        {
            test: 'tap exited with code 1 without reporting a failing test',
            evidence: 'not ok 1 - timeout!\n  ---\n  expired: index.test.ts',
        },
        previous(),
    );

    t.equal(verdict?.kind, 'timeout-under-load', 'the stream settles it');
    t.end();
});

test('a socket event named timeout is not an expiry', t => {
    // The handle dump lists `timeout` among a socket's events, so the word alone cannot decide it.
    const verdict = verdictFor(
        {
            test: 'logs in as the seeded user',
            message: 'expected 200 but received 500',
            evidence: 'events: timeout, resume, pause',
        },
        undefined,
    );

    t.equal(verdict, undefined, 'nothing supports a cause');
    t.end();
});

test('provenance decides the failure the base branch already had', t => {
    t.equal(
        verdictFor({test: 'opens the roles tab', history: {kind: 'new'}}, undefined)?.kind,
        'new-failure',
        'green on main before',
    );
    t.equal(
        verdictFor({test: 'logs in as the seeded user', history: {kind: 'recurring'}}, undefined)
            ?.kind,
        'recurring',
        'already red on main',
    );
    t.end();
});

test('a timeout with no earlier run says only what it knows', t => {
    const verdict = verdictFor({test: 'a group › timeout!', message: 'timeout'}, undefined);
    t.equal(verdict?.kind, 'timeout-under-load', 'the kind');
    t.match(verdict?.reason, /no earlier run of this package was published/, 'and its limit');
    t.end();
});

test('a leg that published nothing carries the operation its own verdict', t => {
    const verdict = legGapVerdict({
        package: 'blong-log',
        detail: ['# blong-log: 82 passed, 0 failed (82 total)'],
    });

    t.equal(verdict.kind, 'leg-gap', 'the kind');
    t.match(verdict.reason, /failures bundle has nothing for it/, 'what makes it a gap');
    t.match(verdict.reason, /blong-log: 82 passed, 0 failed/, 'the operation line it is read from');
    t.end();
});
