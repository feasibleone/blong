/**
 * CascadedDropdown — cascaded dropdown support with parent filtering.
 *
 * Child dropdown filters its options based on the selected value in
 * the parent dropdown. Dropdown data includes a `parent` field for
 * hierarchical filtering.
 */

import React, {useMemo} from 'react';
import {useFormContext, useWatch} from 'react-hook-form';

import type {DropdownOption} from '../types.js';

/** Props for the CascadedDropdown component. */
export interface CascadedDropdownProps {
    /** Field name for this dropdown. */
    name: string;
    /** Display label. */
    label: string;
    /** All options (unfiltered). */
    options: DropdownOption[];
    /** Parent field name to watch for cascading. */
    parentField?: string;
    /** Placeholder text. */
    placeholder?: string;
    /** Whether the field is required. */
    required?: boolean;
    /** Whether the field is disabled. */
    disabled?: boolean;
    /** CSS class name. */
    className?: string;
}

/**
 * CascadedDropdown — a dropdown that filters options based on parent value.
 *
 * @example
 * ```tsx
 * <CascadedDropdown
 *     name="cityId"
 *     label="City"
 *     options={cityOptions}
 *     parentField="countryId"
 * />
 * ```
 */
export function CascadedDropdown({
    name,
    label,
    options,
    parentField,
    placeholder = 'Select...',
    required = false,
    disabled = false,
    className = '',
}: CascadedDropdownProps): React.ReactElement {
    const {
        register,
        formState: {errors},
    } = useFormContext();
    const parentValue = useWatch({name: parentField as string, disabled: !parentField});

    const filteredOptions = useMemo(() => {
        if (!parentField || parentValue == null) return options;
        // Coerce both sides to string for comparison since HTML select returns strings
        const parentStr = String(parentValue);
        return options.filter(opt => String(opt.parent) === parentStr);
    }, [options, parentField, parentValue]);

    const error = errors[name];

    return React.createElement(
        'div',
        {className: `blong-field blong-cascaded-dropdown ${className}`},
        React.createElement('label', {htmlFor: name}, label),
        React.createElement(
            'select',
            {
                ...register(name, {required: required ? `${label} is required` : false}),
                id: name,
                disabled: disabled || (parentField != null && !parentValue),
                className: error ? 'p-invalid' : '',
            },
            React.createElement('option', {value: ''}, placeholder),
            ...filteredOptions.map(opt =>
                React.createElement(
                    'option',
                    {key: String(opt.value), value: opt.value},
                    opt.label,
                ),
            ),
        ),
        error &&
            React.createElement(
                'small',
                {className: 'blong-field-error'},
                String((error as {message?: string}).message ?? 'Invalid'),
            ),
    );
}
