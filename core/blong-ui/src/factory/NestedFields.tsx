/**
 * NestedFields — handle nested objects (Fieldset) and arrays (useFieldArray).
 *
 * Provides components for rendering nested object properties as grouped
 * fieldsets and array properties as repeatable field sections.
 */

import React, {useCallback} from 'react';
import {useFieldArray, useFormContext} from 'react-hook-form';
import type {FieldValues} from 'react-hook-form';

import type {BlongSchema, BlongSchemaProperty, DropdownOption, Dropdowns} from '../types.js';
import {resolveField, renderField} from './FieldResolver.js';
import type {ResolvedField} from './FieldResolver.js';

/** Props for the NestedFieldset component. */
export interface NestedFieldsetProps {
    /** Parent field name (dot-path prefix). */
    name: string;
    /** Schema for the nested object. */
    schema: BlongSchemaProperty;
    /** Label for the fieldset. */
    label?: string;
    /** Dropdown options. */
    dropdowns?: Dropdowns;
    /** CSS class name. */
    className?: string;
}

/**
 * NestedFieldset — renders a nested object schema as a grouped fieldset.
 *
 * @example
 * ```tsx
 * <NestedFieldset name="address" schema={addressSchema} label="Address" />
 * ```
 */
export function NestedFieldset({
    name,
    schema,
    label,
    dropdowns,
    className = '',
}: NestedFieldsetProps): React.ReactElement {
    const form = useFormContext();

    if (!schema.properties || typeof schema.properties !== 'object') {
        return React.createElement('div', null);
    }

    const properties = schema.properties as Record<string, BlongSchemaProperty>;
    const requiredFields = (schema.required ?? []) as string[];

    const fields: ResolvedField[] = Object.entries(properties)
        .map(([fieldName, prop]) => resolveField(`${name}.${fieldName}`, prop, requiredFields))
        .filter(f => !f.hidden)
        .sort((a, b) => a.order - b.order);

    return React.createElement(
        'fieldset',
        {className: `blong-nested-fieldset ${className}`},
        label && React.createElement('legend', null, label),
        ...fields.map(field =>
            renderField(field, form, dropdowns?.[field.lookup ?? field.name]),
        ),
    );
}

/** Props for the ArrayFields component. */
export interface ArrayFieldsProps {
    /** Parent field name (used for useFieldArray). */
    name: string;
    /** Schema for the array items (must be object type). */
    itemSchema: BlongSchemaProperty;
    /** Label for the array section. */
    label?: string;
    /** Dropdown options. */
    dropdowns?: Dropdowns;
    /** Maximum items allowed. */
    maxItems?: number;
    /** Minimum items required. */
    minItems?: number;
    /** CSS class name. */
    className?: string;
}

/**
 * ArrayFields — renders an array of objects as repeatable field sections.
 *
 * Uses react-hook-form's useFieldArray for efficient array state management.
 *
 * @example
 * ```tsx
 * <ArrayFields name="phones" itemSchema={phoneSchema} label="Phone Numbers" />
 * ```
 */
export function ArrayFields({
    name,
    itemSchema,
    label,
    dropdowns,
    maxItems,
    minItems = 0,
    className = '',
}: ArrayFieldsProps): React.ReactElement {
    const form = useFormContext();
    const {fields, append, remove} = useFieldArray({
        control: form.control,
        name,
    });

    const properties = (itemSchema.properties ?? {}) as Record<string, BlongSchemaProperty>;
    const requiredFields = (itemSchema.required ?? []) as string[];

    const handleAdd = useCallback(() => {
        if (maxItems != null && fields.length >= maxItems) return;
        const defaults: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(properties)) {
            if ('default' in prop) defaults[key] = prop.default;
        }
        append(defaults);
    }, [append, fields.length, maxItems, properties]);

    const handleRemove = useCallback(
        (index: number) => {
            if (fields.length <= minItems) return;
            remove(index);
        },
        [remove, fields.length, minItems],
    );

    return React.createElement(
        'div',
        {className: `blong-array-fields ${className}`},
        label && React.createElement('h4', {className: 'blong-array-label'}, label),
        ...fields.map((field, index) => {
            const itemFields: ResolvedField[] = Object.entries(properties)
                .map(([fieldName, prop]) =>
                    resolveField(`${name}.${index}.${fieldName}`, prop, requiredFields),
                )
                .filter(f => !f.hidden)
                .sort((a, b) => a.order - b.order);

            return React.createElement(
                'div',
                {key: field.id, className: 'blong-array-item'},
                React.createElement(
                    'div',
                    {className: 'blong-array-item-header'},
                    React.createElement('span', null, `#${index + 1}`),
                    React.createElement(
                        'button',
                        {
                            type: 'button',
                            className: 'blong-btn blong-btn-remove',
                            onClick: () => handleRemove(index),
                            disabled: fields.length <= minItems,
                        },
                        '✕',
                    ),
                ),
                ...itemFields.map(f =>
                    renderField(f, form, dropdowns?.[f.lookup ?? f.name]),
                ),
            );
        }),
        React.createElement(
            'button',
            {
                type: 'button',
                className: 'blong-btn blong-btn-add',
                onClick: handleAdd,
                disabled: maxItems != null && fields.length >= maxItems,
            },
            '+ Add',
        ),
    );
}
