/**
 * Tests for the error-mirror mute a deliberate-error case wraps itself in.
 *
 * What matters is what the helper promises: the mirrors a case *declares* are silenced
 * inside the wrapped body, everything else it printed reaches the console, and the
 * function the body replaced is back the moment it returns or throws. The failing
 * property to guard is the interesting one — a mute of `console.error` as a whole would
 * swallow the unexpected mirror that is the only clue to a real breakage.
 *
 * The recording console is installed by assignment rather than with a spy, because that
 * is what the helper captures as "the console that was there": a spy would have been
 * wiped by `mockRestore`, which is why the helper restores the reference it captured.
 */

import {expect, it} from 'vitest';
import {muteErrorMirrors} from './setup.js';

/** A stand-in console that records what reaches it, installed for the duration. */
function recordingConsole(): {lines: string[]; restore: () => void} {
    const lines: string[] = [];
    const real = console.error;
    console.error = ((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    }) as typeof console.error;
    return {lines, restore: () => (console.error = real)};
}

it('silences a declared mirror and forwards the ones the case did not declare', async () => {
    const outside = recordingConsole();
    try {
        const wrapped = muteErrorMirrors(() => {
            console.error('[blong] error toast Validation error', 'Correct the field.');
            console.error('[blong] broken.broken.find failed', {error: new Error('Unknown')});
        }, 'error toast Validation error');
        await wrapped();
    } finally {
        outside.restore();
    }

    expect(outside.lines).toHaveLength(1);
    expect(outside.lines[0]).toContain('broken.broken.find failed');
    expect(
        outside.lines.some(line => line.includes('Validation error')),
        'the declared mirror did not reach the console',
    ).toBe(false);
});

it('matches a pattern against every argument of the call', async () => {
    const outside = recordingConsole();
    try {
        const wrapped = muteErrorMirrors(() => {
            // The method is the first argument and the reason the third, which is what
            // a case names when it declares more than one pattern.
            console.error('[blong] fail.method failed', {params: []}, new Error('Query failed'));
        }, ['fail.method failed', 'Query failed']);
        await wrapped();
    } finally {
        outside.restore();
    }

    expect(outside.lines).toHaveLength(0);
});

it('restores console.error when the body returns or throws', async () => {
    const outside = console.error;

    const returns = muteErrorMirrors(() => undefined, 'anything');
    await returns();
    expect(console.error).toBe(outside);

    const throws = muteErrorMirrors(() => {
        throw new Error('the case failed');
    }, 'anything');
    await expect(throws()).rejects.toThrow('the case failed');
    expect(console.error).toBe(outside);
});

it('gives an enclosing mute back to a nested one', async () => {
    const outside = console.error;
    let afterInner: typeof console.error | undefined;

    const inner = muteErrorMirrors(() => undefined, 'anything');
    const outer = muteErrorMirrors(async () => {
        await inner();
        afterInner = console.error;
    }, 'anything');
    await outer();

    expect(afterInner).not.toBe(outside);
    expect(console.error).toBe(outside);
});
