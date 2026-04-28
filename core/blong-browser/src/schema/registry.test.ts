import {describe, expect, it} from 'vitest';
import {enrichSchema, schemaRegistry} from './registry.js';

describe('enrichSchema', () => {
    it('enriches a schema with properties', () => {
        const schema = enrichSchema('user', {
            title: 'User',
            required: ['userName'],
            properties: {
                userName: {type: 'string', title: 'User Name'},
                age: {type: 'integer'},
                active: {type: 'boolean'},
            },
        });
        expect(schema.name).toBe('user');
        expect(schema.title).toBe('User');
        expect(schema.properties!.userName.required).toBe(true);
        expect(schema.properties!.age.required).toBe(false);
        expect(schema.properties!.userName.widget?.type).toBe('input');
        expect(schema.properties!.age.widget?.type).toBe('integer');
        expect(schema.properties!.active.widget?.type).toBe('boolean');
    });

    it('falls back to field name as title', () => {
        const schema = enrichSchema('item', {properties: {itemName: {type: 'string'}}});
        expect(schema.properties!.itemName.title).toBe('Item Name');
    });

    it('infers date widget from date-related field name', () => {
        const schema = enrichSchema('event', {
            properties: {
                createdDate: {type: 'string'},
                startDateTime: {type: 'string'},
            },
        });
        expect(schema.properties!.createdDate.widget?.type).toBe('date');
        expect(schema.properties!.startDateTime.widget?.type).toBe('dateTime');
    });

    it('infers password widget', () => {
        const schema = enrichSchema('auth', {
            properties: {newPassword: {type: 'string'}},
        });
        expect(schema.properties!.newPassword.widget?.type).toBe('password');
    });

    it('infers textarea widget for description fields', () => {
        const schema = enrichSchema('note', {
            properties: {description: {type: 'string'}},
        });
        expect(schema.properties!.description.widget?.type).toBe('textArea');
    });

    it('uses x-widget override', () => {
        const schema = enrichSchema('payment', {
            properties: {
                amount: {type: 'number', 'x-widget': {type: 'currency'} as never},
            },
        });
        expect(schema.properties!.amount.widget?.type).toBe('currency');
    });

    it('uses enum to infer select widget', () => {
        const schema = enrichSchema('order', {
            properties: {
                status: {type: 'string', enum: ['pending', 'paid', 'shipped']},
            },
        });
        expect(schema.properties!.status.widget?.type).toBe('select');
    });

    it('handles schema with no properties', () => {
        const schema = enrichSchema('empty', {title: 'Empty'});
        expect(schema.properties).toEqual({});
    });
});

describe('schemaRegistry', () => {
    it('sets and gets a schema', () => {
        const mockSchema = {name: 'test.entity', title: 'Test Entity', properties: {}};
        schemaRegistry.set('test.entity', mockSchema);
        expect(schemaRegistry.get('test.entity')).toEqual(mockSchema);
    });

    it('normalizes key to lowercase', () => {
        const mockSchema = {name: 'product.item', title: 'Product Item', properties: {}};
        schemaRegistry.set('Product.Item', mockSchema);
        expect(schemaRegistry.get('product.item')).toEqual(mockSchema);
    });

    it('has() returns true for registered schema', () => {
        schemaRegistry.set('user.profile', {
            name: 'user.profile',
            title: 'Profile',
            properties: {},
        });
        expect(schemaRegistry.has('user.profile')).toBe(true);
        expect(schemaRegistry.has('user.PROFILE')).toBe(true); // normalized
    });

    it('has() returns false for unregistered schema', () => {
        expect(schemaRegistry.has('nonexistent.xyz.abc')).toBe(false);
    });

    it('resolve() returns cached schema if available', async () => {
        const schema = {name: 'cached.entity', title: 'Cached', properties: {}};
        schemaRegistry.set('cached.entity', schema);
        const resolved = await schemaRegistry.resolve('cached.entity');
        expect(resolved).toEqual(schema);
    });
});
