/**
 * FileUpload — support multipart/form-data submission for file fields.
 *
 * When a form has file fields (x-blong-widget: file), the submission
 * switches from application/json to multipart/form-data.
 */

import React, {useCallback, useRef} from 'react';
import {useFormContext} from 'react-hook-form';

/** Props for the FileUploadField component. */
export interface FileUploadFieldProps {
    /** Field name in the form. */
    name: string;
    /** Display label. */
    label: string;
    /** Accepted file types (e.g., 'image/*', '.pdf'). */
    accept?: string;
    /** Whether multiple files are allowed. */
    multiple?: boolean;
    /** Maximum file size in bytes. */
    maxSize?: number;
    /** Whether the field is required. */
    required?: boolean;
    /** Whether the field is disabled. */
    disabled?: boolean;
    /** CSS class name. */
    className?: string;
}

/**
 * FileUploadField — a file input widget for use within forms.
 *
 * @example
 * ```tsx
 * <FileUploadField
 *     name="avatar"
 *     label="Profile Photo"
 *     accept="image/*"
 *     maxSize={5 * 1024 * 1024}
 * />
 * ```
 */
export function FileUploadField({
    name,
    label,
    accept,
    multiple = false,
    maxSize,
    required = false,
    disabled = false,
    className = '',
}: FileUploadFieldProps): React.ReactElement {
    const {register, formState: {errors}, setValue} = useFormContext();
    const inputRef = useRef<HTMLInputElement>(null);

    const error = errors[name];

    const validate = useCallback(
        (fileList: FileList | null): string | true => {
            if (required && (!fileList || fileList.length === 0)) {
                return `${label} is required`;
            }
            if (maxSize && fileList) {
                for (let i = 0; i < fileList.length; i++) {
                    if (fileList[i].size > maxSize) {
                        const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
                        return `File exceeds maximum size of ${maxMB}MB`;
                    }
                }
            }
            return true;
        },
        [required, maxSize, label],
    );

    return React.createElement(
        'div',
        {className: `blong-field blong-file-upload ${className}`},
        React.createElement('label', {htmlFor: name}, label),
        React.createElement('input', {
            ...register(name, {validate}),
            type: 'file',
            id: name,
            accept,
            multiple,
            disabled,
            ref: inputRef,
        }),
        error &&
            React.createElement(
                'small',
                {className: 'blong-field-error'},
                String((error as {message?: string}).message ?? 'Invalid'),
            ),
    );
}

/**
 * Detect whether a form has any file fields based on schema.
 */
export function hasFileFields(
    properties: Record<string, {['x-blong-widget']?: string; format?: string}>,
): boolean {
    return Object.values(properties).some(
        prop => prop['x-blong-widget'] === 'file' || prop.format === 'binary',
    );
}
