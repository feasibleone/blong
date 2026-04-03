import {renderHook} from '@testing-library/react';
import React from 'react';
import {describe, expect, it, vi} from 'vitest';
import {BlongUiProvider} from '../context/BlongUiContext.js';
import {useLayout} from './useLayout.js';

const dispatch = vi.fn();
const wrapper = ({children}: {children: React.ReactNode}) => (
    <BlongUiProvider
        dispatch={dispatch}
        schemaUrl="/test.json"
    >
        {children}
    </BlongUiProvider>
);

const schema = {
    properties: {
        name: {title: 'Name'},
        email: {title: 'Email'},
        age: {title: 'Age'},
        role: {title: 'Role'},
    },
};

describe('useLayout', () => {
    it('auto-generates a default card with all fields when no cards config', () => {
        const {result} = renderHook(() => useLayout(schema, undefined, 'default', undefined), {
            wrapper,
        });
        expect(result.current.cards['default']).toBeDefined();
        expect(result.current.cards['default'].fields).toContain('name');
        expect(result.current.cards['default'].fields).toContain('email');
    });

    it('uses provided cards config', () => {
        const cards = {
            personal: {label: 'Personal', fields: ['name', 'email']},
            professional: {label: 'Professional', fields: ['age', 'role']},
        };
        const {result} = renderHook(() => useLayout(schema, cards, 'default', undefined), {
            wrapper,
        });
        expect(result.current.cards['personal'].fields).toEqual(['name', 'email']);
        expect(result.current.cards['professional'].fields).toEqual(['age', 'role']);
    });

    it('generates default rows (one row per card)', () => {
        const cards = {
            info: {label: 'Info', widgets: ['name']},
            extra: {label: 'Extra', widgets: ['age']},
        };
        const {result} = renderHook(() => useLayout(schema, cards, 'default', undefined), {
            wrapper,
        });
        // Default layout: one row per card
        expect(result.current.rows).toHaveLength(2);
    });

    it('uses provided layouts config', () => {
        const cards = {a: {label: 'A', widgets: ['name']}, b: {label: 'B', widgets: ['email']}};
        const layouts = {custom: [['a', 'b']] as never};
        const {result} = renderHook(() => useLayout(schema, cards, 'custom', layouts), {wrapper});
        // Both cards are in one row
        expect(result.current.rows).toHaveLength(2);
    });

    it('returns allFields list from all cards', () => {
        const cards = {
            main: {label: 'Main', widgets: ['name', 'email']},
            side: {label: 'Side', widgets: ['age']},
        };
        const {result} = renderHook(() => useLayout(schema, cards, 'default', undefined), {
            wrapper,
        });
        expect(result.current.allFields).toContain('name');
        expect(result.current.allFields).toContain('email');
        expect(result.current.allFields).toContain('age');
    });

    it('handles undefined schema gracefully', () => {
        const {result} = renderHook(() => useLayout(undefined, undefined, 'default', undefined), {
            wrapper,
        });
        expect(result.current.cards['default']).toBeDefined();
        expect(result.current.rows).toHaveLength(1);
    });

    it('handles fields array in card config', () => {
        const cards = {info: {label: 'Info', fields: ['name', 'email']}};
        const {result} = renderHook(() => useLayout(schema, cards, 'default', undefined), {
            wrapper,
        });
        expect(result.current.cards['info'].fields).toEqual(['name', 'email']);
    });
});
