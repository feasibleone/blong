/**
 * FieldResolver — resolve `x-blong-*` extensions to component props.
 *
 * Handles widget overrides, hidden fields, display order, and group assignment.
 */

import React from 'react';
import type {UseFormReturn, FieldValues} from 'react-hook-form';

import type {BlongSchema, BlongSchemaProperty, DropdownOption} from '../types.js';
import {resolveWidgetType} from './WidgetMap.js';

/** Resolved field metadata for rendering. */
export interface ResolvedField {
    /** The property name (form field name). */
    name: string;
    /** Display label. */
    label: string;
    /** Widget type to render. */
    widget: string;
    /** Whether the field is hidden. */
    hidden: boolean;
    /** Display order (lower = first). */
    order: number;
    /** Card group assignment. */
    group?: string;
    /** Whether the field is required. */
    required: boolean;
    /** Whether the field is read-only. */
    readOnly: boolean;
    /** Placeholder text. */
    placeholder?: string;
    /** Tooltip/help text. */
    tooltip?: string;
    /** The raw schema property. */
    schema: BlongSchemaProperty;
    /** Dropdown options (if applicable). */
    options?: DropdownOption[];
    /** Input mask pattern. */
    mask?: string;
    /** Currency code. */
    currency?: string;
    /** Lookup type identifier. */
    lookup?: string;
    /** Additional component props from extensions. */
    componentProps: Record<string, unknown>;
}

/**
 * Resolve a single schema property to a ResolvedField.
 */
export function resolveField(
    name: string,
    property: BlongSchemaProperty,
    requiredFields?: string[],
): ResolvedField {
    const widget = resolveWidgetType(property);
    const isRequired = requiredFields?.includes(name) ?? false;

    const componentProps: Record<string, unknown> = {};

    // Number constraints
    if (property.minimum != null) componentProps.min = property.minimum;
    if (property.maximum != null) componentProps.max = property.maximum;
    if (widget === 'currency' && property['x-blong-currency']) {
        componentProps.currency = property['x-blong-currency'];
        componentProps.mode = 'currency';
    }
    if (widget === 'integer') {
        componentProps.useGrouping = false;
        componentProps.maxFractionDigits = 0;
    }

    // String constraints
    if (property.maxLength != null) componentProps.maxLength = property.maxLength;
    if (property.minLength != null) componentProps.minLength = property.minLength;
    if (property.pattern) componentProps.pattern = property.pattern;

    // Date/time
    if (widget === 'date') componentProps.showIcon = true;
    if (widget === 'time') {
        componentProps.showIcon = true;
        componentProps.timeOnly = true;
    }
    if (widget === 'datetime') {
        componentProps.showIcon = true;
        componentProps.showTime = true;
    }

    // Mask
    if (widget === 'mask' && property['x-blong-mask']) {
        componentProps.mask = property['x-blong-mask'];
    }

    // Text area
    if (widget === 'text') {
        componentProps.rows = 5;
        componentProps.autoResize = true;
    }

    return {
        name,
        label: property.title ?? name,
        widget,
        hidden: property['x-blong-hidden'] ?? false,
        order: property['x-blong-order'] ?? 999,
        group: property['x-blong-group'],
        required: isRequired,
        readOnly: property['x-blong-readonly'] ?? property.readOnly ?? false,
        placeholder: property['x-blong-placeholder'],
        tooltip: property['x-blong-tooltip'],
        schema: property,
        mask: property['x-blong-mask'],
        currency: property['x-blong-currency'],
        lookup: property['x-blong-lookup'],
        componentProps,
    };
}

/**
 * Resolve all fields from a schema, sorted by order.
 */
export function resolveFields(
    schema: BlongSchema | undefined,
    requiredFields?: string[],
): ResolvedField[] {
    if (!schema?.properties) return [];

    const fields: ResolvedField[] = [];

    for (const [name, property] of Object.entries(schema.properties)) {
        fields.push(resolveField(name, property as BlongSchemaProperty, requiredFields));
    }

    return fields.sort((a, b) => a.order - b.order);
}

/**
 * Safely retrieve a nested error from formState.errors by dot-path name.
 * React Hook Form stores errors for nested fields (e.g. `address.city`)
 * as nested objects, not dot-path keys.
 */
function getNestedError(
    errors: Record<string, unknown>,
    name: string,
): {message?: string} | undefined {
    const parts = name.split('.');
    let current: unknown = errors;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current as {message?: string} | undefined;
}

/**
 * Render a single field based on its resolved metadata.
 * Returns a React element wrapping the appropriate PrimeReact component.
 */
export function renderField(
    field: ResolvedField,
    form: UseFormReturn<FieldValues>,
    options?: DropdownOption[],
): React.ReactElement {
    if (field.hidden) return React.createElement(React.Fragment);

    const error = getNestedError(
        form.formState.errors as unknown as Record<string, unknown>,
        field.name,
    );
    const fieldOptions = options ?? field.options;

    const inputProps: Record<string, unknown> = {
        id: field.name,
        disabled: field.readOnly,
        placeholder: field.placeholder,
        className: error ? 'p-invalid' : '',
        ...field.componentProps,
    };

    // Build the input element based on widget type
    let inputElement: React.ReactElement;

    switch (field.widget) {
        case 'boolean':
            inputElement = React.createElement('input', {
                ...form.register(field.name),
                type: 'checkbox',
                ...inputProps,
            });
            break;
        case 'dropdown':
        case 'select':
            inputElement = React.createElement(
                'select',
                {...form.register(field.name), ...inputProps},
                React.createElement('option', {value: ''}, field.placeholder ?? 'Select...'),
                ...(fieldOptions?.map(opt =>
                    React.createElement('option', {key: String(opt.value), value: opt.value}, opt.label),
                ) ?? []),
            );
            break;
        case 'text':
            inputElement = React.createElement('textarea', {
                ...form.register(field.name),
                ...inputProps,
                rows: 5,
            });
            break;
        case 'number':
        case 'currency':
        case 'integer':
            inputElement = React.createElement('input', {
                ...form.register(field.name, {valueAsNumber: true}),
                type: 'number',
                ...inputProps,
            });
            break;
        case 'date':
        case 'time':
        case 'datetime':
            inputElement = React.createElement('input', {
                ...form.register(field.name),
                type: field.widget === 'time' ? 'time' : field.widget === 'datetime' ? 'datetime-local' : 'date',
                ...inputProps,
            });
            break;
        case 'password':
            inputElement = React.createElement('input', {
                ...form.register(field.name),
                type: 'password',
                ...inputProps,
            });
            break;
        case 'file':
            inputElement = React.createElement('input', {
                ...form.register(field.name),
                type: 'file',
                ...inputProps,
            });
            break;
        default:
            inputElement = React.createElement('input', {
                ...form.register(field.name),
                type: 'text',
                ...inputProps,
            });
    }

    return React.createElement(
        'div',
        {className: 'blong-field', key: field.name},
        React.createElement('label', {htmlFor: field.name}, field.label),
        inputElement,
        error &&
            React.createElement(
                'small',
                {className: 'blong-field-error'},
                String((error as {message?: string}).message ?? 'Invalid'),
            ),
    );
}
