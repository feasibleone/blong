import {describe, expect, it} from 'vitest';
import {buildValidationRules, stripDollarKeys} from './validate.js';

describe('buildValidationRules', () => {
    it('returns empty rules for empty schema', () => {
        expect(buildValidationRules({})).toEqual({});
    });

    it('adds required rule', () => {
        const rules = buildValidationRules({required: true, title: 'Name'});
        expect(rules.required).toBe('"Name" is required');
    });

    it('adds minLength rule', () => {
        const rules = buildValidationRules({minLength: 3, title: 'Username'});
        expect((rules.minLength as {value: number}).value).toBe(3);
        expect((rules.minLength as {message: string}).message).toContain('at least 3');
    });

    it('adds maxLength rule', () => {
        const rules = buildValidationRules({maxLength: 50, title: 'Bio'});
        expect((rules.maxLength as {value: number}).value).toBe(50);
        expect((rules.maxLength as {message: string}).message).toContain('at most 50');
    });

    it('adds minimum (min) rule', () => {
        const rules = buildValidationRules({minimum: 18, title: 'Age'});
        expect((rules.min as {value: number}).value).toBe(18);
        expect((rules.min as {message: string}).message).toContain('at least 18');
    });

    it('adds maximum (max) rule', () => {
        const rules = buildValidationRules({maximum: 100, title: 'Score'});
        expect((rules.max as {value: number}).value).toBe(100);
        expect((rules.max as {message: string}).message).toContain('at most 100');
    });

    it('adds pattern rule', () => {
        const rules = buildValidationRules({pattern: '^[a-z]+$', title: 'Slug'});
        expect((rules.pattern as {value: RegExp}).value).toBeInstanceOf(RegExp);
        expect((rules.pattern as {message: string}).message).toContain('invalid format');
    });

    it('falls back to schema.name when title is absent', () => {
        const rules = buildValidationRules({required: true, name: 'userId'});
        expect(rules.required).toContain('userId');
    });

    it('combines multiple rules', () => {
        const rules = buildValidationRules({
            required: true,
            minLength: 2,
            maxLength: 20,
            title: 'Alias',
        });
        expect(rules.required).toBeTruthy();
        expect(rules.minLength).toBeTruthy();
        expect(rules.maxLength).toBeTruthy();
    });
});

describe('buildValidationRules — name fallback (no title)', () => {
    it('uses schema.name in minLength message when title absent', () => {
        const rules = buildValidationRules({minLength: 5, name: 'username'});
        expect((rules.minLength as {message: string}).message).toContain('username');
    });

    it('uses schema.name in maxLength message when title absent', () => {
        const rules = buildValidationRules({maxLength: 20, name: 'bio'});
        expect((rules.maxLength as {message: string}).message).toContain('bio');
    });

    it('uses schema.name in minimum message when title absent', () => {
        const rules = buildValidationRules({minimum: 0, name: 'qty'});
        expect((rules.min as {message: string}).message).toContain('qty');
    });

    it('uses schema.name in maximum message when title absent', () => {
        const rules = buildValidationRules({maximum: 99, name: 'score'});
        expect((rules.max as {message: string}).message).toContain('score');
    });

    it('uses schema.name in pattern message when title absent', () => {
        const rules = buildValidationRules({pattern: '^[a-z]+$', name: 'slug'});
        expect((rules.pattern as {message: string}).message).toContain('slug');
    });
});

describe('stripDollarKeys', () => {
    it('removes the $ key from an object', () => {
        const result = stripDollarKeys({name: 'Alice', $: '$meta', age: 30});
        expect(result).not.toHaveProperty('$');
        expect(result).toEqual({name: 'Alice', age: 30});
    });

    it('returns the object unchanged when $ is absent', () => {
        const result = stripDollarKeys({name: 'Bob'});
        expect(result).toEqual({name: 'Bob'});
    });

    it('handles empty object', () => {
        expect(stripDollarKeys({})).toEqual({});
    });
});
