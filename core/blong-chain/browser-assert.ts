/**
 * A browser-safe subset of `node:assert`.
 *
 * The executor only needs an object with the usual assertion methods; a browser run has no
 * `node:assert` to hand it. This module implements the surface the chain and the test groups use,
 * including the deep comparisons, so a browser-hosted run reports the same pass/fail shape as the
 * server one. It is a fallback: a caller can pass its own `assert` in `ITestExecutorConfig`.
 */
import type nodeAssert from 'node:assert';

type Assert = typeof nodeAssert;

export interface IAssertionOptions {
    message?: string;
    actual?: unknown;
    expected?: unknown;
    operator?: string;
}

export class AssertionError extends Error {
    actual?: unknown;
    expected?: unknown;
    operator?: string;
    code = 'ERR_ASSERTION';

    constructor(options: IAssertionOptions | string = {}) {
        const details = typeof options === 'string' ? {message: options} : options;
        super(details.message ?? 'Assertion failed');
        this.name = 'AssertionError';
        this.actual = details.actual;
        this.expected = details.expected;
        this.operator = details.operator;
    }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** Structural equality with cycle protection; Dates, RegExps, Maps, Sets and arrays included. */
export function deepEqual(actual: unknown, expected: unknown, seen = new WeakMap()): boolean {
    if (Object.is(actual, expected)) return true;
    if (!isObject(actual) || !isObject(expected)) return false;
    if (actual instanceof Date || expected instanceof Date) {
        return (
            actual instanceof Date &&
            expected instanceof Date &&
            actual.getTime() === expected.getTime()
        );
    }
    if (actual instanceof RegExp || expected instanceof RegExp) {
        return (
            actual instanceof RegExp &&
            expected instanceof RegExp &&
            String(actual) === String(expected)
        );
    }
    if (Array.isArray(actual) !== Array.isArray(expected)) return false;
    if (Array.isArray(actual) && Array.isArray(expected)) {
        if (actual.length !== expected.length) return false;
        let pairs = seen.get(actual);
        if (pairs?.has(expected)) return true;
        if (!pairs) seen.set(actual, (pairs = new WeakSet()));
        pairs.add(expected);
        return actual.every((value, index) => deepEqual(value, expected[index], seen));
    }
    if (actual instanceof Map || expected instanceof Map) {
        if (
            !(actual instanceof Map) ||
            !(expected instanceof Map) ||
            actual.size !== expected.size
        ) {
            return false;
        }
        for (const [key, value] of actual) {
            if (!expected.has(key) || !deepEqual(value, expected.get(key), seen)) return false;
        }
        return true;
    }
    if (actual instanceof Set || expected instanceof Set) {
        if (
            !(actual instanceof Set) ||
            !(expected instanceof Set) ||
            actual.size !== expected.size
        ) {
            return false;
        }
        for (const value of actual) {
            if (!expected.has(value)) return false;
        }
        return true;
    }
    let pairs = seen.get(actual);
    if (pairs?.has(expected)) return true;
    if (!pairs) seen.set(actual, (pairs = new WeakSet()));
    pairs.add(expected);
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    return (
        actualKeys.length === expectedKeys.length &&
        actualKeys.every(
            key =>
                Object.prototype.hasOwnProperty.call(expected, key) &&
                deepEqual(actual[key], expected[key], seen),
        )
    );
}

const fail = (options: IAssertionOptions): never => {
    throw new AssertionError(options);
};

const check = (value: unknown, message?: string): void => {
    if (!value)
        fail({
            message: message ?? 'The expression evaluated to a falsy value',
            actual: value,
            operator: '==',
        });
};

const same = (actual: unknown, expected: unknown, message?: string): void => {
    if (!Object.is(actual, expected)) {
        fail({
            message:
                message ??
                `Expected values to be strictly equal: ${String(actual)} !== ${String(expected)}`,
            actual,
            expected,
            operator: 'strictEqual',
        });
    }
};

const notSame = (actual: unknown, expected: unknown, message?: string): void => {
    if (Object.is(actual, expected)) {
        fail({
            message: message ?? 'Expected values to be strictly not equal',
            actual,
            expected,
            operator: 'notStrictEqual',
        });
    }
};

const looseSame = (actual: unknown, expected: unknown, message?: string): void => {
    if (!(actual == expected)) {
        fail({
            message:
                message ?? `Expected values to be equal: ${String(actual)} != ${String(expected)}`,
            actual,
            expected,
            operator: 'equal',
        });
    }
};

const looseNotSame = (actual: unknown, expected: unknown, message?: string): void => {
    if (actual == expected) {
        fail({
            message: message ?? 'Expected values to be not equal',
            actual,
            expected,
            operator: 'notEqual',
        });
    }
};

const deepSame = (actual: unknown, expected: unknown, message?: string): void => {
    if (!deepEqual(actual, expected)) {
        fail({
            message: message ?? 'Expected values to be deeply equal',
            actual,
            expected,
            operator: 'deepEqual',
        });
    }
};

const deepNotSame = (actual: unknown, expected: unknown, message?: string): void => {
    if (deepEqual(actual, expected)) {
        fail({
            message: message ?? 'Expected values to be not deeply equal',
            actual,
            expected,
            operator: 'notDeepEqual',
        });
    }
};

const matches = (actual: unknown, expected: unknown): boolean => {
    if (expected instanceof RegExp) return expected.test(String(actual));
    if (typeof expected === 'string') return String(actual).includes(expected);
    return false;
};

const throws = (fn: () => unknown, expected?: unknown, message?: string): void => {
    let thrown: unknown;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    if (thrown === undefined)
        fail({message: message ?? 'Missing expected exception', operator: 'throws'});
    if (
        expected instanceof RegExp &&
        !expected.test(String((thrown as Error)?.message ?? thrown))
    ) {
        fail({
            message: message ?? 'The thrown error did not match the pattern',
            actual: thrown,
            expected,
            operator: 'throws',
        });
    }
    if (typeof expected === 'function' && expected.prototype instanceof Error) {
        if (!(thrown instanceof (expected as new (...args: never[]) => Error))) {
            fail({
                message: message ?? 'The thrown error was not an instance of the expected type',
                actual: thrown,
                expected,
                operator: 'throws',
            });
        }
    }
};

const doesNotThrow = (fn: () => unknown, message?: string): void => {
    try {
        fn();
    } catch (error) {
        fail({
            message: message ?? `Got unwanted exception: ${(error as Error)?.message ?? error}`,
            actual: error,
            operator: 'doesNotThrow',
        });
    }
};

const rejects = async (
    promise: Promise<unknown>,
    expected?: unknown,
    message?: string,
): Promise<void> => {
    try {
        await promise;
    } catch (error) {
        if (
            expected instanceof RegExp &&
            !expected.test(String((error as Error)?.message ?? error))
        ) {
            fail({
                message: message ?? 'The rejection did not match the pattern',
                actual: error,
                expected,
                operator: 'rejects',
            });
        }
        return;
    }
    fail({message: message ?? 'Missing expected rejection', operator: 'rejects'});
};

const doesNotReject = async (promise: Promise<unknown>, message?: string): Promise<void> => {
    try {
        await promise;
    } catch (error) {
        fail({
            message: message ?? `Got unwanted rejection: ${(error as Error)?.message ?? error}`,
            actual: error,
            operator: 'doesNotReject',
        });
    }
};

const ifError = (value: unknown): void => {
    if (value) throw value;
};

const assert = ((value: unknown, message?: string) => check(value, message)) as Assert;
Object.assign(assert, {
    AssertionError,
    ok: check,
    equal: looseSame,
    notEqual: looseNotSame,
    strictEqual: same,
    notStrictEqual: notSame,
    deepEqual: deepSame,
    notDeepEqual: deepNotSame,
    deepStrictEqual: deepSame,
    notDeepStrictEqual: deepNotSame,
    fail: (message?: string | IAssertionOptions) =>
        fail(typeof message === 'string' ? {message} : (message ?? {})),
    throws,
    doesNotThrow,
    rejects,
    doesNotReject,
    ifError,
    match: (actual: unknown, expected: unknown, message?: string) => {
        if (!matches(actual, expected))
            fail({
                message: message ?? 'The string did not match the pattern',
                actual,
                expected,
                operator: 'match',
            });
    },
    doesNotMatch: (actual: unknown, expected: unknown, message?: string) => {
        if (matches(actual, expected))
            fail({
                message: message ?? 'The string matched the pattern',
                actual,
                expected,
                operator: 'doesNotMatch',
            });
    },
});
(assert as unknown as {strict: Assert}).strict = assert;

/** A fresh assert object, so a run cannot mutate the shared one. */
export function createBrowserAssert(): Assert {
    return assert;
}
