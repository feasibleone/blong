/**
 * FormFactory — generate a react-hook-form form from a request JSON Schema.
 *
 * Uses TypeBox/JSON Schema resolver for validation, integrates with the
 * cards/layouts model, and implements the trigger pattern for toolbar Save.
 */

import React, {useCallback, useEffect, useMemo} from 'react';
import {FormProvider, useForm} from 'react-hook-form';
import type {FieldValues, UseFormReturn} from 'react-hook-form';

import type {
    BlongSchema,
    Card,
    Cards,
    CustomWidgets,
    DropdownOption,
    Dropdowns,
    FormMode,
    Layout,
} from '../types.js';
import {resolveField} from './FieldResolver.js';
import type {ResolvedField} from './FieldResolver.js';
import {renderField} from './FieldResolver.js';
import {isCardVisible} from './CardResolver.js';
import {getTabCards, isTabbedLayout} from './LayoutResolver.js';

/** Props for the FormFactory component. */
export interface FormFactoryProps {
    /** The JSON Schema to generate the form from. */
    schema: BlongSchema;
    /** Card definitions for grouping fields. */
    cards: Cards;
    /** Active layout definition. */
    layout: Layout;
    /** Current form mode (create or edit). */
    mode: FormMode;
    /** Default values for the form fields. */
    defaultValues?: Record<string, unknown>;
    /** Dropdown options keyed by field/lookup name. */
    dropdowns?: Dropdowns;
    /** Custom widget components. */
    editors?: CustomWidgets;
    /** Called when the form becomes dirty (trigger pattern). */
    onTrigger?: (submitFn: (() => Promise<void>) | undefined) => void;
    /** Called when the form is submitted. */
    onSubmit: (data: Record<string, unknown>, mode: FormMode) => Promise<void>;
    /** Form field values to watch for conditional visibility. */
    watchFields?: string[];
    /** Whether data is still loading (show skeletons). */
    isLoading?: boolean;
    /** Active tab index for tabbed layouts. */
    activeTab?: number;
    /** CSS class for the form container. */
    className?: string;
}

/**
 * Render a card with its fields.
 */
function CardGroup({
    card,
    fields,
    form,
    dropdowns,
}: {
    card: Card;
    fields: ResolvedField[];
    form: UseFormReturn<FieldValues>;
    dropdowns?: Dropdowns;
}): React.ReactElement {
    return React.createElement(
        'fieldset',
        {className: `blong-card blong-card-${card.id}`, key: card.id},
        card.label && React.createElement('legend', null, card.label),
        fields.map(field =>
            renderField(field, form, dropdowns?.[field.lookup ?? field.name]),
        ),
    );
}

/**
 * FormFactory component — generates a full form from schema + cards + layout.
 *
 * @example
 * ```tsx
 * <FormFactory
 *     schema={methodSchema.request}
 *     cards={myCards}
 *     layout={activeLayout}
 *     mode="edit"
 *     defaultValues={record}
 *     dropdowns={dropdowns}
 *     onTrigger={setTrigger}
 *     onSubmit={handleSave}
 * />
 * ```
 */
export function FormFactory({
    schema,
    cards,
    layout,
    mode,
    defaultValues,
    dropdowns,
    editors: _editors,
    onTrigger,
    onSubmit,
    watchFields,
    isLoading = false,
    activeTab = 0,
    className = '',
}: FormFactoryProps): React.ReactElement {
    const form = useForm<FieldValues>({
        defaultValues: defaultValues as FieldValues,
        mode: 'onChange',
    });

    const {handleSubmit, formState, reset} = form;
    const {isDirty} = formState;

    // Reset form when default values change
    useEffect(() => {
        if (defaultValues) {
            reset(defaultValues as FieldValues);
        }
    }, [defaultValues, reset]);

    // Trigger pattern: notify parent when form becomes dirty/clean
    const submitFn = useCallback(
        async () => {
            await handleSubmit(async (data) => {
                await onSubmit(data, mode);
            })();
        },
        [handleSubmit, onSubmit, mode],
    );

    useEffect(() => {
        onTrigger?.(isDirty ? submitFn : undefined);
    }, [isDirty, submitFn, onTrigger]);

    // Resolve fields per card
    const requiredFields = schema.required as string[] | undefined;

    // Watch values for conditional card visibility
    const watchedValues: Record<string, unknown> = {};
    if (watchFields) {
        for (const field of watchFields) {
            watchedValues[field] = form.watch(field);
        }
    }

    // Determine which cards to show based on active tab
    const visibleCardIds = useMemo(() => {
        if (isTabbedLayout(layout)) {
            return new Set(getTabCards(layout, activeTab));
        }
        return new Set(layout.cards);
    }, [layout, activeTab]);

    // Loading skeleton
    if (isLoading) {
        return React.createElement(
            'div',
            {className: `blong-form blong-form-loading ${className}`},
            ...Array.from({length: 3}, (_, i) =>
                React.createElement('div', {
                    key: i,
                    className: 'blong-skeleton blong-skeleton-card',
                }),
            ),
        );
    }

    // Render tabbed layout navigation
    const tabNav = isTabbedLayout(layout)
        ? React.createElement(
              'div',
              {className: 'blong-tabs', role: 'tablist'},
              layout.items!.map((tab, idx) =>
                  React.createElement(
                      'button',
                      {
                          key: tab.label,
                          role: 'tab',
                          'aria-selected': idx === activeTab,
                          className: `blong-tab ${idx === activeTab ? 'blong-tab-active' : ''}`,
                      },
                      tab.label,
                  ),
              ),
          )
        : null;

    // Render cards
    const cardElements = layout.cards
        .filter(cardId => visibleCardIds.has(cardId))
        .map(cardId => {
            const card = cards[cardId];
            if (!card) return null;
            if (!isCardVisible(card, watchedValues)) return null;

            // Resolve fields for this card
            const fields: ResolvedField[] = [];
            for (const widget of card.widgets) {
                const names = typeof widget === 'string' ? [widget] : widget;
                for (const name of names) {
                    const prop = schema.properties?.[name];
                    if (prop) {
                        fields.push(resolveField(name, prop, requiredFields));
                    }
                }
            }

            return React.createElement(CardGroup, {
                key: cardId,
                card,
                fields,
                form,
                dropdowns,
            });
        })
        .filter(Boolean);

    return React.createElement(
        FormProvider,
        form,
        React.createElement(
            'form',
            {
                className: `blong-form blong-form-${mode} ${className}`,
                onSubmit: handleSubmit(async data => onSubmit(data, mode)),
                noValidate: true,
            },
            tabNav,
            ...cardElements,
        ),
    );
}
