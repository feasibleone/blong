import {describe, expect, it} from 'vitest';
import {deepMerge, withDefaults} from './defaults.js';

describe('deepMerge', () => {
    it('merges two flat objects', () => {
        const result = deepMerge({a: 1, b: 2}, {b: 3, c: 4});
        expect(result).toEqual({a: 1, b: 3, c: 4});
    });

    it('merges nested objects recursively', () => {
        const result = deepMerge({x: {a: 1, b: 2}}, {x: {b: 99, c: 3}});
        expect(result).toEqual({x: {a: 1, b: 99, c: 3}});
    });

    it('overwrites arrays (does not merge them)', () => {
        const result = deepMerge({items: [1, 2]}, {items: [3, 4, 5]});
        expect(result).toEqual({items: [3, 4, 5]});
    });

    it('handles multiple sources', () => {
        const result = deepMerge({a: 1}, {b: 2}, {c: 3});
        expect(result).toEqual({a: 1, b: 2, c: 3});
    });

    it('handles null/undefined source gracefully', () => {
        const result = deepMerge({a: 1}, undefined as never);
        expect(result).toEqual({a: 1});
    });

    it('handles null values in source', () => {
        const result = deepMerge({a: 1, b: {x: 1}}, {b: null as never});
        expect(result.b).toBeNull();
    });
});

describe('withDefaults', () => {
    it('fills in keyField default', () => {
        const result = withDefaults({subject: 'user', object: 'user'});
        expect(result.keyField).toBe('userId');
    });

    it('fills in objectTitle from capitalized object', () => {
        const result = withDefaults({subject: 'product', object: 'product'});
        expect(result.objectTitle).toBe('Product');
    });

    it('uses provided objectTitle', () => {
        const result = withDefaults({
            subject: 'user',
            object: 'user',
            objectTitle: 'System User',
        });
        expect(result.objectTitle).toBe('System User');
    });

    it('uses provided keyField', () => {
        const result = withDefaults({
            subject: 'order',
            object: 'order',
            keyField: 'orderId',
        });
        expect(result.keyField).toBe('orderId');
    });

    it('generates default method names', () => {
        const result = withDefaults({subject: 'auth', object: 'user'});
        expect(result.methods.find).toBe('auth.user.find');
        expect(result.methods.add).toBe('auth.user.add');
        expect(result.methods.get).toBe('auth.user.get');
        expect(result.methods.edit).toBe('auth.user.edit');
        expect(result.methods.remove).toBe('auth.user.remove');
    });

    it('generates browser permission defaults', () => {
        const result = withDefaults({subject: 'finance', object: 'payment'});
        expect(result.browser.permission.browse).toBe('finance.payment.browse');
        expect(result.browser.permission.add).toBe('finance.payment.add');
    });

    it('uses provided methods overrides', () => {
        const result = withDefaults({
            subject: 'auth',
            object: 'user',
            methods: {find: 'custom.find.method'},
        });
        expect(result.methods.find).toBe('custom.find.method');
        expect(result.methods.add).toBe('auth.user.add'); // others still default
    });

    it('fills in browser configuration', () => {
        const result = withDefaults({subject: 'catalog', object: 'item'});
        expect(result.browser).toBeDefined();
        expect(result.browser.title).toBeDefined();
        expect(result.browser.icon).toBeDefined();
    });
});
