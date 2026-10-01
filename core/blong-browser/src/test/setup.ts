import '@testing-library/jest-dom';
import {expect, vi} from 'vitest';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** One console argument as text, for matching a pattern against a whole call. */
function asText(arg: unknown): string {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message;
    try {
        return JSON.stringify(arg) ?? String(arg);
    } catch {
        // A circular or otherwise unserializable value still has to be matchable
        // against the patterns, and String() is what the console would print.
        return String(arg);
    }
}

/**
 * Run one test case with **only the mirrors it declares** silenced.
 *
 * `[blong] error toast`, `[blong] error dialog` and `[blong] <method> failed` are
 * written to the browser console on purpose: they are how an agent or a Playwright
 * spec, which reads the page through `page.on('console')`, sees a failed call or a
 * popup it has no other handle on. A unit test asserts the store state or the DOM
 * those lines mirror, so it has no reader for them — and the stack trace a rejected
 * call prints is the bulk of this suite's stderr, which is how a reader learns to
 * skip stderr entirely and misses the one line that was real.
 *
 * Every call that does not match one of `expected` is passed to the console that was
 * there before, so the mute cannot hide the failure a case is *not* about: a mirror
 * the case did not predict — a second toast, a dialog from another code path — still
 * prints, where a mute of `console.error` as a whole would have swallowed it. That is
 * also what makes a stale pattern visible: a line the helper was supposed to match but
 * no longer does reappears in the run's stderr instead of being lost.
 *
 * `expected` is required, and its entries are substrings of what the call printed —
 * matched against every argument, so a method name in the first and an error message in
 * the third can both be named:
 *
 * ```ts
 * it(
 *     'returns error state when dispatch rejects',
 *     muteErrorMirrors(async () => {
 *         …
 *     }, ['fail.method failed', 'Query failed']),
 * );
 * ```
 *
 * Wraps the case rather than the file: the mute is lifted before the next case runs
 * (this suite configures no `restoreMocks`), and it puts back the function it found
 * rather than delegating to a spy, so a case that patches `console.error` itself — or
 * nests this helper — still gets its own function back.
 */
export function muteErrorMirrors<T>(
    body: () => T | Promise<T>,
    expected: string | readonly string[],
): () => Promise<void> {
    const patterns = typeof expected === 'string' ? [expected] : [...expected];
    return async () => {
        const real = console.error;
        console.error = ((...args: unknown[]) => {
            const line = args.map(asText).join(' ');
            if (patterns.some(pattern => line.includes(pattern))) return;
            Reflect.apply(real, console, args);
        }) as typeof console.error;
        try {
            await body();
        } finally {
            console.error = real;
        }
    };
}

// Tell React we are in an act-capable test environment so that state updates
// triggered by internal library timers (e.g. PrimeReact animations) don't
// generate "not configured to support act" noise.  @testing-library/react sets
// this inside every act() call but resets it to the *previous* value when act
// exits; setting it here makes the default true for the whole suite.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// PrimeReact's Dropdown / Select components schedule focus-management callbacks
// via setTimeout(0).  These fire during @testing-library/react's waitFor()
// polling window, where IS_REACT_ACT_ENVIRONMENT is temporarily set to false by
// the library's asyncWrapper.  The combination produces harmless "The current
// testing environment is not configured to support act(...)" noise from
// PrimeReact internals — not from our code.
//
// With IS_REACT_ACT_ENVIRONMENT = true (set above), genuine act() omissions in
// *our* code surface instead as "An update to X was not wrapped in act(...)" —
// a different message that is NOT suppressed here.  The suppressed message
// structurally requires IS_REACT_ACT_ENVIRONMENT to be false, which in this
// suite only happens inside @testing-library's asyncWrapper window.
//
// To make the suppression more surgical (catching cases where a test explicitly
// sets IS_REACT_ACT_ENVIRONMENT = false), move it into the specific describe()
// blocks that render PrimeReact Dropdown/Select components via beforeAll/afterAll.
//
// All other console.error output is preserved.
const _origConsoleError = console.error.bind(console);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('not configured to support act')) {
        return;
    }
    _origConsoleError(...args);
};

// Normalise PrimeReact's internal pr_id_* counters in DOM snapshots.
//
// PrimeReact assigns a global incrementing integer to each component instance.
// It appears in two ways:
//   - as an attribute NAME:  <div pr_id_55="">      ← empty marker
//   - in an attribute VALUE: <div aria-controls="pr_id_55_panel">
//
// The integer changes depending on how many PrimeReact components mounted
// before the snapshot point, making raw snapshots fragile across runs.
// This serializer normalises all occurrences to "pr_id_0" so snapshots only
// capture structure, not internal identity counters.
//
// Guard flag prevents re-entry: serialize(val) inside print() would otherwise
// cycle back into this same serializer for every child Element.
let _serialising = false;

function normalisePrIds(root: Element): void {
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        for (const attr of Array.from(el.attributes)) {
            if (/^pr_id_\d/.test(attr.name)) {
                // attribute name IS a pr_id marker → remove it entirely
                el.removeAttribute(attr.name);
            } else if (/pr_id_\d/.test(attr.value)) {
                // attribute value CONTAINS a pr_id reference → normalise
                el.setAttribute(attr.name, attr.value.replace(/pr_id_\d+/g, 'pr_id_0'));
            }
        }
    }
}

expect.addSnapshotSerializer({
    test(val) {
        return (
            !_serialising && val != null && typeof val === 'object' && (val as Node).nodeType === 1
        );
    },
    print(val, serialize) {
        normalisePrIds(val as Element);
        _serialising = true;
        try {
            return serialize(val);
        } finally {
            _serialising = false;
        }
    },
});

// PrimeReact uses ResizeObserver — polyfill for jsdom
global.ResizeObserver = vi.fn(
    class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    },
);

// scrollIntoView is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// matchMedia is not implemented in jsdom
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// URL.createObjectURL / revokeObjectURL are not implemented in jsdom
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = vi.fn();
