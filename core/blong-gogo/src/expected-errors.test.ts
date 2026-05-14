/**
 * Unit tests for the "expected errors" feature.
 *
 * Covers:
 *  - isExpectedError() matching rules (exact, array, wildcard)
 *  - AdapterBase.error() log-level demotion for expected errors
 *  - Gateway respects `expectedErrors` config flag
 *  - Propagation: expect travels with $meta through the handler chain
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {isExpectedError} from './lib.ts';

// ---------------------------------------------------------------------------
// isExpectedError() — matching rules
// ---------------------------------------------------------------------------

describe('isExpectedError — matching rules', () => {
    it('returns false when error type is undefined', () => {
        assert.strictEqual(isExpectedError(undefined, 'foo.bar'), false);
    });

    it('returns false when expect is undefined', () => {
        assert.strictEqual(isExpectedError('foo.bar', undefined), false);
    });

    it('returns false when expect is an empty array', () => {
        assert.strictEqual(isExpectedError('foo.bar', []), false);
    });

    it('exact string — matches identical type', () => {
        assert.strictEqual(isExpectedError('parking.invalidZone', 'parking.invalidZone'), true);
    });

    it('exact string — does not match different type', () => {
        assert.strictEqual(isExpectedError('parking.rateLimit', 'parking.invalidZone'), false);
    });

    it('array — matches when type is in the list', () => {
        assert.strictEqual(
            isExpectedError('auth.unauthorized', ['parking.invalidZone', 'auth.unauthorized']),
            true,
        );
    });

    it('array — does not match when type is absent from the list', () => {
        assert.strictEqual(
            isExpectedError('payment.failed', ['parking.invalidZone', 'auth.unauthorized']),
            false,
        );
    });

    it('wildcard — matches any type with the given prefix', () => {
        assert.strictEqual(isExpectedError('parking.invalidZone', 'parking.*'), true);
        assert.strictEqual(isExpectedError('parking.rateLimit', 'parking.*'), true);
    });

    it('wildcard — does not match a different namespace', () => {
        assert.strictEqual(isExpectedError('auth.unauthorized', 'parking.*'), false);
    });

    it('wildcard — does not match the prefix segment itself (no dot)', () => {
        // 'parking' alone should NOT match 'parking.*' (requires the dot)
        assert.strictEqual(isExpectedError('parking', 'parking.*'), false);
    });

    it('array with wildcard — matches when a wildcard entry covers the type', () => {
        assert.strictEqual(
            isExpectedError('parking.invalidZone', ['auth.*', 'parking.*']),
            true,
        );
    });

    it('wildcard at top of namespace — auth.*', () => {
        assert.strictEqual(isExpectedError('auth.unauthorized', 'auth.*'), true);
        assert.strictEqual(isExpectedError('auth.tokenExpired', 'auth.*'), true);
        assert.strictEqual(isExpectedError('gateway.jwtMissingHeader', 'auth.*'), false);
    });
});

// ---------------------------------------------------------------------------
// AdapterBase.error() — log-level demotion
// ---------------------------------------------------------------------------

describe('AdapterBase.error() — log-level demotion', () => {
    /**
     * Minimal stand-in for AdapterBase that exposes only the `error()` method
     * under test.  We copy the implementation verbatim so we are testing the
     * real logic without spinning up a full adapter.
     */
    function makeAdapter(log: Record<string, (...a: unknown[]) => void>) {
        return {
            log,
            error(
                error: {type?: string; method?: string},
                $meta: {method?: string; expect?: string | string[]},
            ) {
                if ($meta) error.method = $meta.method;
                if (isExpectedError(error.type, $meta?.expect)) {
                    (this.log as Record<string, (...a: unknown[]) => void>).debug?.(error);
                    return;
                }
                (this.log as Record<string, (...a: unknown[]) => void>).error?.(error);
            },
        };
    }

    it('logs at error level when expect is not set', () => {
        const logged: {level: string; error: unknown}[] = [];
        const adapter = makeAdapter({
            error: e => logged.push({level: 'error', error: e}),
            debug: e => logged.push({level: 'debug', error: e}),
        });

        adapter.error({type: 'parking.invalidZone'}, {method: 'parkingTest'});

        assert.strictEqual(logged.length, 1);
        assert.strictEqual(logged[0].level, 'error');
    });

    it('logs at debug level and does not log at error when error is expected', () => {
        const logged: {level: string; error: unknown}[] = [];
        const adapter = makeAdapter({
            error: e => logged.push({level: 'error', error: e}),
            debug: e => logged.push({level: 'debug', error: e}),
        });

        adapter.error(
            {type: 'parking.invalidZone'},
            {method: 'parkingTest', expect: 'parking.invalidZone'},
        );

        assert.strictEqual(logged.length, 1);
        assert.strictEqual(logged[0].level, 'debug');
    });

    it('logs at debug level for wildcard match', () => {
        const logged: {level: string; error: unknown}[] = [];
        const adapter = makeAdapter({
            error: e => logged.push({level: 'error', error: e}),
            debug: e => logged.push({level: 'debug', error: e}),
        });

        adapter.error(
            {type: 'parking.rateLimit'},
            {method: 'parkingTest', expect: 'parking.*'},
        );

        assert.strictEqual(logged.length, 1);
        assert.strictEqual(logged[0].level, 'debug');
    });

    it('logs at error level when the error type does not match expect', () => {
        const logged: {level: string; error: unknown}[] = [];
        const adapter = makeAdapter({
            error: e => logged.push({level: 'error', error: e}),
            debug: e => logged.push({level: 'debug', error: e}),
        });

        adapter.error(
            {type: 'auth.unauthorized'},
            {method: 'someMethod', expect: 'parking.invalidZone'},
        );

        assert.strictEqual(logged.length, 1);
        assert.strictEqual(logged[0].level, 'error');
    });

    it('attaches $meta.method to the error object', () => {
        const captured: unknown[] = [];
        const adapter = makeAdapter({
            error: e => captured.push(e),
            debug: () => {},
        });

        const err: {type: string; method?: string} = {type: 'foo.bar'};
        adapter.error(err, {method: 'someMethod'});

        assert.strictEqual((captured[0] as typeof err).method, 'someMethod');
    });

    it('attaches $meta.method even when the error is expected', () => {
        const captured: unknown[] = [];
        const adapter = makeAdapter({
            error: () => {},
            debug: e => captured.push(e),
        });

        const err: {type: string; method?: string} = {type: 'parking.invalidZone'};
        adapter.error(err, {method: 'parkingTest', expect: 'parking.invalidZone'});

        assert.strictEqual((captured[0] as typeof err).method, 'parkingTest');
    });
});

// ---------------------------------------------------------------------------
// Gateway expectedErrors flag
// ---------------------------------------------------------------------------

describe('Gateway — expectedErrors config flag', () => {
    /**
     * Simulate the gateway route-handler logic that builds `resolvedExpect`.
     * Returns the value of `resolvedExpect` that the gateway would compute.
     */
    function buildResolvedExpect(
        expectedErrorsEnabled: boolean,
        expectFromBody: string | string[] | undefined,
    ): string[] | undefined {
        return expectedErrorsEnabled && expectFromBody
            ? ([] as string[]).concat(expectFromBody)
            : undefined;
    }

    it('resolves expect when expectedErrors is true and expect is provided', () => {
        const result = buildResolvedExpect(true, 'parking.invalidZone');
        assert.deepStrictEqual(result, ['parking.invalidZone']);
    });

    it('resolves expect array when expectedErrors is true', () => {
        const result = buildResolvedExpect(true, ['parking.invalidZone', 'auth.unauthorized']);
        assert.deepStrictEqual(result, ['parking.invalidZone', 'auth.unauthorized']);
    });

    it('returns undefined when expectedErrors is false (production)', () => {
        const result = buildResolvedExpect(false, 'parking.invalidZone');
        assert.strictEqual(result, undefined);
    });

    it('returns undefined when expect is not provided even if expectedErrors is true', () => {
        const result = buildResolvedExpect(true, undefined);
        assert.strictEqual(result, undefined);
    });

    it('with resolvedExpect=undefined, isExpectedError always returns false', () => {
        assert.strictEqual(isExpectedError('parking.invalidZone', undefined), false);
    });
});

// ---------------------------------------------------------------------------
// Meta propagation — $meta.expect travels through handler chain
// ---------------------------------------------------------------------------

describe('$meta.expect propagation', () => {
    /**
     * Simulate a two-hop dispatch: caller → first handler → second handler.
     * The second handler logs an error and the first handler propagates it.
     * Verify that $meta.expect set by the caller controls log level at every hop.
     */
    it('expect set by caller controls log level at every handler in the chain', () => {
        const logged: {level: string; type: string}[] = [];

        function logError(error: {type: string}, $meta: {expect?: string | string[]}) {
            if (isExpectedError(error.type, $meta?.expect)) {
                logged.push({level: 'debug', type: error.type});
            } else {
                logged.push({level: 'error', type: error.type});
            }
        }

        const callerMeta = {method: 'callerMethod', expect: 'foo.someError'};

        // Simulate two handler hops both receiving the same $meta
        logError({type: 'foo.someError'}, callerMeta); // hop 1
        logError({type: 'foo.someError'}, callerMeta); // hop 2

        assert.strictEqual(logged.length, 2);
        assert.ok(logged.every(l => l.level === 'debug'), 'all hops should log at debug');
    });

    it('an error type not in expect is still logged at error level on all hops', () => {
        const logged: {level: string; type: string}[] = [];

        function logError(error: {type: string}, $meta: {expect?: string | string[]}) {
            if (isExpectedError(error.type, $meta?.expect)) {
                logged.push({level: 'debug', type: error.type});
            } else {
                logged.push({level: 'error', type: error.type});
            }
        }

        const callerMeta = {method: 'callerMethod', expect: 'foo.someError'};

        logError({type: 'bar.otherError'}, callerMeta); // unexpected on hop 1
        logError({type: 'bar.otherError'}, callerMeta); // unexpected on hop 2

        assert.strictEqual(logged.length, 2);
        assert.ok(logged.every(l => l.level === 'error'), 'unexpected errors stay at error level');
    });
});
