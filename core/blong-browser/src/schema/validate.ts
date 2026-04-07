/**
 * Schema-driven validation builder.
 * Converts enriched JSON Schema into react-hook-form validation rules.
 */
import type {RegisterOptions} from 'react-hook-form';
import type {IEnrichedFieldSchema} from '../types/widget.js';

/** Build react-hook-form validation rules from an enriched field schema */
export function buildValidationRules(schema: IEnrichedFieldSchema): RegisterOptions {
    const rules: RegisterOptions = {};

    if (schema.required) {
        rules.required = `"${schema.title ?? schema.name}" is required`;
    }
    if (schema.minLength != null) {
        rules.minLength = {
            value: schema.minLength,
            message: `"${schema.title ?? schema.name}" must be at least ${schema.minLength} characters`,
        };
    }
    if (schema.maxLength != null) {
        rules.maxLength = {
            value: schema.maxLength,
            message: `"${schema.title ?? schema.name}" must be at most ${schema.maxLength} characters`,
        };
    }
    if (schema.minimum != null) {
        rules.min = {
            value: schema.minimum,
            message: `"${schema.title ?? schema.name}" must be at least ${schema.minimum}`,
        };
    }
    if (schema.maximum != null) {
        rules.max = {
            value: schema.maximum,
            message: `"${schema.title ?? schema.name}" must be at most ${schema.maximum}`,
        };
    }
    if (schema.pattern) {
        rules.pattern = {
            value: new RegExp(schema.pattern),
            message: `"${schema.title ?? schema.name}" has invalid format`,
        };
    }

    return rules;
}

/** Strip reserved $ keys from a form values object before sending to the backend */
export function stripDollarKeys<T extends Record<string, unknown>>(values: T): Omit<T, '$'> {
    const result = {...values};
    delete (result as Record<string, unknown>)['$'];
    return result as Omit<T, '$'>;
}
