/**
 * The browser half of the vocabulary seam.
 *
 * A page has no port for the realms it does not own, so a component reaches its declaration through
 * the log rather than through `attachSignals`: `BrowserLog.signalFor(name, level)` builds the same
 * view over what the packages in the process contributed, bound to the component's own name so the
 * record keeps its header. What is pinned here is that the seam works at all in the browser, that an
 * undeclared name is absent from the proxy, and that a call is written at the level the declaration
 * named rather than always at `info` (@@D-920).
 *
 * The first test asserts on a process that has contributed nothing, so it runs first: nothing in this
 * package contributes a vocabulary, and `clearContributed` is deliberately not exported from lukaot's
 * root — a running process is not allowed to take a package's names away.
 */

import {contribute} from '@feasibleone/lukaot';
import {test} from 'tap';

import BrowserLog from './BrowserLog.ts';

/** Capture what the page would print, and put `console` back afterwards. */
function captureConsole(t: {teardown: (fn: () => void) => void}): unknown[][] {
    const calls: unknown[][] = [];
    const original = {log: console.log, warn: console.warn, error: console.error};
    console.log = (...args: unknown[]) => calls.push(args);
    console.warn = (...args: unknown[]) => calls.push(args);
    console.error = (...args: unknown[]) => calls.push(args);
    t.teardown(() => {
        console.log = original.log;
        console.warn = original.warn;
        console.error = original.error;
    });
    return calls;
}

test('a page that declared nothing has no signal at all', async t => {
    const log = new BrowserLog({level: 'info'});
    t.equal(log.signalFor('Anything'), undefined, 'a call site is then a no-op');
    t.end();
});

test('a component in a page may call a name its realm contributed', async t => {
    const printed = captureConsole(t);
    contribute({
        log: {
            fixtureLoginTokenMissing: {
                level: 'warn',
                message: 'no token: {response}',
            },
        },
    });

    const log = new BrowserLog({level: 'trace', logByLevel: true});
    const signal = log.signalFor('AuthLogin', 'trace');
    t.equal(typeof signal?.fixtureLoginTokenMissing, 'function', 'the name is callable');
    t.equal(signal?.fixtureNeverDeclared, undefined, 'a name nobody declared is absent');

    signal?.fixtureLoginTokenMissing?.({response: '{}'});

    t.equal(printed.length, 1, 'one call prints one line');
    // The browser printer's argument order: format, time, level css, level, service css, name.
    const args = printed[0] as unknown[];
    t.equal((args[3] as string).trim(), 'WARN', 'the level is the one the declaration named');
    t.equal(args[5], 'AuthLogin', 'the record carries the component that reported it');
    t.match(String(args[0]), /%c/, 'printed through the browser logger, not a bare console call');
    t.end();
});
