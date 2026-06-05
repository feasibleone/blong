/**
 * Schema-driven validation builder.
 * Converts enriched JSON Schema into react-hook-form validation rules.
 */
import type {IEnrichedFieldSchema} from '@feasibleone/blong';
import type {RegisterOptions} from 'react-hook-form';

/** Build react-hook-form validation rules from an enriched field schema */
export function buildValidationRules(schema: IEnrichedFieldSchema): RegisterOptions {
    const rules: RegisterOptions = {};

    if (schema.fieldRequired) {
        rules.required = '{field} is required';
    }
    if (schema.minLength != null) {
        rules.minLength = {
            value: schema.minLength,
            message: '{field} must be at least {minLength} characters',
        };
    }
    if (schema.maxLength != null) {
        rules.maxLength = {
            value: schema.maxLength,
            message: '{field} must be at most {maxLength} characters',
        };
    }
    if (schema.minimum != null) {
        rules.min = {
            value: schema.minimum,
            message: '{field} must be at least {minimum}',
        };
    }
    if (schema.maximum != null) {
        rules.max = {
            value: schema.maximum,
            message: '{field} must be at most {maximum}',
        };
    }
    if (schema.pattern) {
        rules.pattern = {
            value: new RegExp(schema.pattern),
            message: '{field} has invalid format',
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
