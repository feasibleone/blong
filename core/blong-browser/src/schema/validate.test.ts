import {describe, expect, it} from 'vitest';
import {buildValidationRules, stripDollarKeys} from './validate.js';

describe('buildValidationRules', () => {
    it('returns empty rules for empty schema', () => {
        expect(buildValidationRules({})).toEqual({});
    });

    it('adds required rule', () => {
        const rules = buildValidationRules({fieldRequired: true, title: 'Name'});
        expect(rules.required).toBe('{field} is required');
    });

    it('adds minLength rule', () => {
        const rules = buildValidationRules({minLength: 3, title: 'Username'});
        expect((rules.minLength as {value: number}).value).toBe(3);
        expect((rules.minLength as {message: string}).message).toBe(
            '{field} must be at least {minLength} characters',
        );
    });

    it('adds maxLength rule', () => {
        const rules = buildValidationRules({maxLength: 50, title: 'Bio'});
        expect((rules.maxLength as {value: number}).value).toBe(50);
        expect((rules.maxLength as {message: string}).message).toBe(
            '{field} must be at most {maxLength} characters',
        );
    });

    it('adds minimum (min) rule', () => {
        const rules = buildValidationRules({minimum: 18, title: 'Age'});
        expect((rules.min as {value: number}).value).toBe(18);
        expect((rules.min as {message: string}).message).toBe('{field} must be at least {minimum}');
    });

    it('adds maximum (max) rule', () => {
        const rules = buildValidationRules({maximum: 100, title: 'Score'});
        expect((rules.max as {value: number}).value).toBe(100);
        expect((rules.max as {message: string}).message).toBe('{field} must be at most {maximum}');
    });

    it('adds pattern rule', () => {
        const rules = buildValidationRules({pattern: '^[a-z]+$', title: 'Slug'});
        expect((rules.pattern as {value: RegExp}).value).toBeInstanceOf(RegExp);
        expect((rules.pattern as {message: string}).message).toBe('{field} has invalid format');
    });

    it('uses {field} placeholder regardless of title or name', () => {
        const rules = buildValidationRules({fieldRequired: true, name: 'userId'});
        expect(rules.required).toBe('{field} is required');
    });

    it('combines multiple rules', () => {
        const rules = buildValidationRules({
            fieldRequired: true,
            minLength: 2,
            maxLength: 20,
            title: 'Alias',
        });
        expect(rules.required).toBeTruthy();
        expect(rules.minLength).toBeTruthy();
        expect(rules.maxLength).toBeTruthy();
    });
});

describe('buildValidationRules — message templates use {field} placeholder', () => {
    it('minLength message is a template', () => {
        const rules = buildValidationRules({minLength: 5, name: 'username'});
        expect((rules.minLength as {message: string}).message).toBe(
            '{field} must be at least {minLength} characters',
        );
    });

    it('maxLength message is a template', () => {
        const rules = buildValidationRules({maxLength: 20, name: 'bio'});
        expect((rules.maxLength as {message: string}).message).toBe(
            '{field} must be at most {maxLength} characters',
        );
    });

    it('minimum message is a template', () => {
        const rules = buildValidationRules({minimum: 0, name: 'qty'});
        expect((rules.min as {message: string}).message).toBe('{field} must be at least {minimum}');
    });

    it('maximum message is a template', () => {
        const rules = buildValidationRules({maximum: 99, name: 'score'});
        expect((rules.max as {message: string}).message).toBe('{field} must be at most {maximum}');
    });

    it('pattern message is a template', () => {
        const rules = buildValidationRules({pattern: '^[a-z]+$', name: 'slug'});
        expect((rules.pattern as {message: string}).message).toBe('{field} has invalid format');
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
