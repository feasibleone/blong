/**
 * Test file for the new Proxy-based error system
 *
 * This test verifies that both the old dot notation and new simplified syntax work correctly
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';
import ErrorFactory from './error.ts';

describe('Error Proxy System', () => {
    const errorFactory = ErrorFactory({
        logFactory: undefined,
        logLevel: 'info',
        errorPrint: '',
    });

    // Register test errors
    errorFactory.register({
        'release.jobTrigger': 'Job trigger failed',
        'release.ping': 'Ping failed for DFSP {dfsp} after {time} seconds: {message}',
        'user.notFound': 'User {userId} not found',
        'payment.insufficientFunds': 'Insufficient funds',
    });

    it('should support old dot notation access (backwards compatibility)', () => {
        const errors = errorFactory.get() as Record<
            string,
            (...args: unknown[]) => {message: string}
        >;

        assert.ok(errors['release.jobTrigger'], 'Error accessible via dot notation');
        assert.strictEqual(errors['release.jobTrigger']().message, 'Job trigger failed');
    });

    it('should support new camelCase access', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing

        assert.ok(errors.errorReleaseJobTrigger, 'Error accessible via errorReleaseJobTrigger');
        assert.strictEqual(errors.errorReleaseJobTrigger().message, 'Job trigger failed');
    });

    it('should support destructuring with new syntax', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing
        const {errorReleaseJobTrigger, errorReleasePing} = errors;

        assert.ok(errorReleaseJobTrigger, 'errorReleaseJobTrigger extracted via destructuring');
        assert.ok(errorReleasePing, 'errorReleasePing extracted via destructuring');

        assert.strictEqual(errorReleaseJobTrigger().message, 'Job trigger failed');
    });

    it('should support destructuring with old syntax (backwards compatibility)', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing
        const {'release.jobTrigger': errorReleaseJobTrigger} = errors;

        assert.ok(errorReleaseJobTrigger, 'Error extracted via old destructuring syntax');
        assert.strictEqual(errorReleaseJobTrigger().message, 'Job trigger failed');
    });

    it('should be case-insensitive for new syntax', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing

        // All these should work
        assert.ok(errors.errorReleaseJobTrigger);
        assert.ok(errors.errorreleasejobTrigger); // Different case
        assert.ok(errors.ERRORRELEASEJOBTRIGGER); // All caps

        // All should return the same error
        assert.strictEqual(
            errors.errorReleaseJobTrigger().message,
            errors.errorreleasejobTrigger().message,
        );
    });

    it('should support parameterized errors', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing
        const {errorReleasePing} = errors;

        const error = errorReleasePing({
            params: {
                dfsp: 'DFSP001',
                time: 120,
                message: 'Connection timeout',
            },
        });

        assert.strictEqual(
            error.message,
            'Ping failed for DFSP DFSP001 after 120 seconds: Connection timeout',
        );
    });

    it('should work with mixed dot notation in error keys', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing

        // 'user.notFound' should be accessible as errorUserNotFound
        const {errorUserNotFound} = errors;
        assert.ok(errorUserNotFound, 'Multi-part error name works');

        const error = errorUserNotFound({params: {userId: '12345'}});
        assert.strictEqual(error.message, 'User 12345 not found');
    });

    it('should throw for non-existent errors to catch typos', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing

        assert.throws(
            () => errors.errorNonExistent,
            /Error 'errorNonExistent' not found/,
            'Should throw for non-existent camelCase error',
        );

        assert.throws(
            () => errors['non.existent'],
            /Error 'non.existent' not found/,
            'Should throw for non-existent dot notation error',
        );
    });

    it('should throw immediately during destructuring of non-existent errors', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing

        // This should throw during destructuring, catching typos early
        assert.throws(
            () => {
                const {errorTypoInName} = errors;
            },
            /Error 'errorTypoInName' not found/,
            'Should throw immediately when destructuring non-existent error',
        );

        // Multiple destructuring with one typo
        assert.throws(
            () => {
                const {errorReleaseJobTrigger, errorTypoError} = errors;
            },
            /Error 'errorTypoError' not found/,
            'Should throw on first non-existent error during destructuring',
        );
    });

    it('should support both syntaxes in the same function', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing

        // New syntax
        const {errorReleaseJobTrigger} = errors;

        // Old syntax
        const oldStyleError = errors['release.jobTrigger'];

        // Both should be the same function
        assert.strictEqual(errorReleaseJobTrigger, oldStyleError);
    });

    it('should preserve error handler properties', () => {
        const errors = errorFactory.get() as any; // Type assertion for Proxy testing
        const {errorReleasePing} = errors;

        assert.strictEqual(errorReleasePing.type, 'release.ping');
        assert.strictEqual(
            errorReleasePing.message,
            'Ping failed for DFSP {dfsp} after {time} seconds: {message}',
        );
        assert.deepStrictEqual(errorReleasePing.params, ['dfsp', 'time', 'message']);
    });

    it('should return the same proxy instance on multiple get() calls', () => {
        const errors1 = errorFactory.get();
        const errors2 = errorFactory.get();
        const errors3 = errorFactory.get();

        // All should be the same proxy instance
        assert.strictEqual(errors1, errors2, 'First and second call should return same proxy');
        assert.strictEqual(errors2, errors3, 'Second and third call should return same proxy');
        assert.strictEqual(errors1, errors3, 'First and third call should return same proxy');
    });
});
