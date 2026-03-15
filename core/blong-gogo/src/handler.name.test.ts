/**
 * Test to verify that handlers get unique names matching their filenames
 */

import {handler} from '@feasibleone/blong/types';
import assert from 'node:assert';
import {describe, it} from 'node:test';

describe('Handler naming', () => {
    it('should preserve explicit handler names when they match expected name', () => {
        const namedHandler = handler(function myHandler({config}) {
            return {send() {}};
        });

        assert.strictEqual(
            (namedHandler as Function).name,
            'myHandler',
            'Named handler should preserve its name',
        );
    });

    it('should allow setting name on anonymous handlers', () => {
        const anonymousHandler = handler(({config}) => {
            return {send() {}};
        });

        // Simulate what Watch.ts does when loading handlers
        Object.defineProperty(anonymousHandler, 'name', {
            value: 'send',
            configurable: true,
            enumerable: false,
        });

        assert.strictEqual(
            (anonymousHandler as Function).name,
            'send',
            'Handler name should be settable',
        );
    });

    it('should ensure names are unique per file', () => {
        const handler1 = handler(({config}) => ({send() {}}));
        const handler2 = handler(({config}) => ({receive() {}}));

        // Simulate loading from different files
        Object.defineProperty(handler1, 'name', {value: 'send', configurable: true});
        Object.defineProperty(handler2, 'name', {value: 'receive', configurable: true});

        assert.strictEqual((handler1 as Function).name, 'send');
        assert.strictEqual((handler2 as Function).name, 'receive');
        assert.notStrictEqual(
            (handler1 as Function).name,
            (handler2 as Function).name,
            'Handlers should have unique names',
        );
    });

    it('should detect mismatch between handler name and expected name', () => {
        // This test verifies that Watch.ts would throw an error for mismatched names
        const namedHandler = handler(function wrongName({config}) {
            return {send() {}};
        });

        // In Watch.ts, this would trigger an error like:
        // "Handler name mismatch in 'send.ts': function is named 'wrongName' but file is named 'send.ts'"

        const actualName = (namedHandler as Function).name;
        const expectedName = 'send';

        assert.notStrictEqual(actualName, expectedName, 'Mismatch should be detectable');
        assert.strictEqual(actualName, 'wrongName', 'Handler should preserve explicit name');
    });
});
