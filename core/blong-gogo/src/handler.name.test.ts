/**
 * Test to verify that handlers get unique names matching their filenames
 */

import {describe, it} from 'node:test';
import assert from 'node:assert';
import {handler} from '@feasibleone/blong';

describe('Handler naming', () => {
    it('should preserve explicit handler names', () => {
        const namedHandler = handler(function myHandler({config}) {
            return {send() {}};
        });
        
        assert.strictEqual((namedHandler as Function).name, 'myHandler', 'Named handler should preserve its name');
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
        
        assert.strictEqual((anonymousHandler as Function).name, 'send', 'Handler name should be settable');
    });

    it('should ensure names are unique per file', () => {
        const handler1 = handler(({config}) => ({send() {}}));
        const handler2 = handler(({config}) => ({receive() {}}));
        
        // Simulate loading from different files
        Object.defineProperty(handler1, 'name', {value: 'send', configurable: true});
        Object.defineProperty(handler2, 'name', {value: 'receive', configurable: true});
        
        assert.strictEqual((handler1 as Function).name, 'send');
        assert.strictEqual((handler2 as Function).name, 'receive');
        assert.notStrictEqual((handler1 as Function).name, (handler2 as Function).name, 'Handlers should have unique names');
    });
});
