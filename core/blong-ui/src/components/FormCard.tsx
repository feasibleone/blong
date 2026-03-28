/**
 * FormCard — card wrapping FormFactory with toolbar (Save, Cancel, Reset).
 *
 * Implements the trigger pattern: Save button activates when the form is
 * dirty, Reset restores `$original` values.
 */

import React, {useCallback, useState} from 'react';

import type {
    BlongSchema,
    Cards,
    CustomWidgets,
    Dropdowns,
    FormMode,
    Layout,
} from '../types.js';
import {FormFactory} from '../factory/FormFactory.js';
import {snapshotOriginal} from '../factory/FormSubmit.js';

/** Props for the FormCard component. */
export interface FormCardProps {
    /** The JSON Schema defining the form fields. */
    schema: BlongSchema;
    /** Card definitions for field grouping. */
    cards: Cards;
    /** Active layout definition. */
    layout: Layout;
    /** Initial form mode. */
    mode?: FormMode;
    /** Default values for the form fields. */
    defaultValues?: Record<string, unknown>;
    /** Dropdown options keyed by field/lookup name. */
    dropdowns?: Dropdowns;
    /** Custom widget components. */
    editors?: CustomWidgets;
    /** Called when the form is submitted successfully. */
    onSubmit: (data: Record<string, unknown>, mode: FormMode) => Promise<void>;
    /** Called when the user cancels. */
    onCancel?: () => void;
    /** Fields to watch for conditional card visibility. */
    watchFields?: string[];
    /** Whether data is loading. */
    isLoading?: boolean;
    /** Title displayed in the card header. */
    title?: string;
    /** CSS class for the container. */
    className?: string;
}

/**
 * FormCard component — form with Save/Cancel/Reset toolbar.
 *
 * @example
 * ```tsx
 * <FormCard
 *     schema={methodSchema.request}
 *     cards={myCards}
 *     layout={activeLayout}
 *     mode="edit"
 *     defaultValues={entity}
 *     onSubmit={handleSave}
 *     onCancel={() => navigate(-1)}
 *     title="Edit User"
 * />
 * ```
 */
export function FormCard({
    schema,
    cards,
    layout,
    mode: initialMode = 'edit',
    defaultValues,
    dropdowns,
    editors,
    onSubmit,
    onCancel,
    watchFields,
    isLoading = false,
    title,
    className = '',
}: FormCardProps): React.ReactElement {
    const [mode, setMode] = useState<FormMode>(initialMode);
    const [trigger, setTrigger] = useState<(() => Promise<void>) | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    const [originalValues] = useState(() =>
        defaultValues ? snapshotOriginal(defaultValues) : undefined,
    );

    const handleSubmit = useCallback(
        async (data: Record<string, unknown>, submitMode: FormMode) => {
            setIsSaving(true);
            try {
                await onSubmit(data, submitMode);
                // Switch from create to edit after successful add
                if (submitMode === 'create') {
                    setMode('edit');
                }
            } finally {
                setIsSaving(false);
            }
        },
        [onSubmit],
    );

    const handleSave = useCallback(async () => {
        if (trigger) await trigger();
    }, [trigger]);

    const toolbar = React.createElement(
        'div',
        {className: 'blong-toolbar'},
        title && React.createElement('h3', {className: 'blong-toolbar-title'}, title),
        React.createElement(
            'div',
            {className: 'blong-toolbar-actions'},
            React.createElement(
                'button',
                {
                    type: 'button',
                    className: 'blong-btn blong-btn-primary',
                    disabled: !trigger || isSaving,
                    onClick: handleSave,
                },
                isSaving ? 'Saving...' : 'Save',
            ),
            onCancel &&
                React.createElement(
                    'button',
                    {
                        type: 'button',
                        className: 'blong-btn blong-btn-secondary',
                        onClick: onCancel,
                        disabled: isSaving,
                    },
                    'Cancel',
                ),
        ),
    );

    return React.createElement(
        'div',
        {className: `blong-form-card ${className}`},
        toolbar,
        React.createElement(FormFactory, {
            schema,
            cards,
            layout,
            mode,
            defaultValues,
            dropdowns,
            editors,
            onTrigger: setTrigger,
            onSubmit: handleSubmit,
            watchFields,
            isLoading,
        }),
    );
}
