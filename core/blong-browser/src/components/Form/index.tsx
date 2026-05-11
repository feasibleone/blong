/**
 * Form — schema-driven form component.
 *
 * Renders a hierarchy of Deck → Card → field for every field in the schema.
 * Supports flat layout, tab layout, steps layout, and split layout.
 * Driven by react-hook-form internally; publishes flattened values via onChange/onSubmit.
 *
 * Form's responsibilities:
 *  - react-hook-form setup (control, errors, reset, getValues)
 *  - Table-row selection state (for master-detail / watch cards)
 *  - Provides FormContext so Deck and Card can render without prop-drilling
 *
 * Layout rendering is delegated to the root Deck component (id="root"),
 * which reads layout info from FormContext and handles all layout types.
 */
import './index.css';

import type {ICardConfig, IEnrichedFieldSchema, IEnrichedSchema} from '@feasibleone/blong';
import React, {useCallback, useEffect, useId, useMemo, useState} from 'react';
import {useForm, type FieldErrors, type SubmitHandler} from 'react-hook-form';
import {useBlongUi} from '../../context/BlongUiContext.js';
import {FormInspector, useDesignMode} from '../../design/index.js';
import {useLayout, type FlatLayoutConfig, type LayoutConfig} from '../../hooks/useLayout.js';
import {useAppStore} from '../../state/appStore.js';
import {Deck} from '../Deck/index.js';
import {FormContext, FormStateContext, type ITableSelection} from './FormContext.js';

export interface IFormProps {
    /** JSON-enriched schema describing fields */
    schema?: IEnrichedSchema;
    /** Card group definitions — each card lists visible fields */
    cards?: Record<string, ICardConfig>;
    /** Active layout key */
    layout?: string;
    /** Layout configuration map — layout key → list of deck rows */
    layouts?: Record<string, LayoutConfig>;
    /** Current form value */
    value?: Record<string, unknown>;
    /** Fired on every valid field change */
    onChange?: (value: Record<string, unknown>) => void;
    /** Fired when the form is submitted (after validation) */
    onSubmit?: (value: Record<string, unknown>) => void | Promise<void>;
    /** Render fields read-only (no inputs) */
    readOnly?: boolean;
    /** Show loading skeleton */
    loading?: boolean;
    /** External validation errors keyed by field name */
    serverErrors?: Record<string, string>;
    /** Form id for external submit buttons */
    id?: string;
    /**
     * Permission check callback. When provided, cards with a `permission` key are only
     * rendered if this function returns true. Cards without a permission key always render.
     * When omitted, all cards with a permission key are hidden (safe default).
     */
    checkPermission?: (permission: string) => boolean;
    /**
     * Static dropdown data. When provided, widgets whose `schema.widget.dropdown` key matches
     * an entry here will use the static options without dispatching portal.dropdown.list.
     */
    dropdowns?: Record<string, {value: unknown; label: string}[]>;
    /**
     * Called whenever a table widget's single selection changes.
     * Receives the field name and the new selection (or null when deselected).
     * The Editor uses this to track the current row for toolbar template resolution.
     */
    onTableSelect?: (fieldName: string, selection: ITableSelection | null) => void;
    /**
     * Called in design mode when the user drags a card to a new position.
     * Receives the layout key and the updated FlatLayoutConfig so the caller can persist the change.
     */
    onLayoutChange?: (layoutKey: string, newLayout: FlatLayoutConfig) => void;
    /**
     * Optional side panel rendered alongside the form (e.g. the design inspector).
     * Rendered inside FormContext.Provider but outside the <form> element so its
     * inputs do not participate in form submission.
     */
    rightPanel?: React.ReactNode;
}

export function Form({
    schema,
    cards: cardsConfig,
    layout = 'default',
    layouts,
    value,
    onChange,
    onSubmit,
    readOnly = false,
    loading = false,
    serverErrors,
    id,
    checkPermission,
    dropdowns,
    onTableSelect,
    onLayoutChange,
    rightPanel,
}: IFormProps) {
    const fallbackId = useId();
    const formId = id ?? fallbackId;

    // Design mode — merge designCtx.config.cards overrides into cardsConfig so
    // layout and field ordering reflect real-time design changes.
    const designCtx = useDesignMode();
    const effectiveCards = useMemo<Record<string, ICardConfig> | undefined>(() => {
        if (!designCtx.active || !cardsConfig) return cardsConfig;
        const result: Record<string, ICardConfig> = {};
        for (const [name, card] of Object.entries(cardsConfig)) {
            const override = designCtx.config.cards[name] as ICardConfig | undefined;
            result[name] = override ? {...card, ...override} : card;
        }
        // Include design-created cards not in original config
        for (const [name, override] of Object.entries(designCtx.config.cards)) {
            if (!(name in result)) result[name] = override as ICardConfig;
        }
        return result;
    }, [cardsConfig, designCtx.active, designCtx.config.cards]);

    // Merge per-field schema overrides from design mode (title, widget type, readOnly, etc.)
    const effectiveSchema = useMemo(() => {
        if (!designCtx.active || !schema) return schema;
        const overrides = designCtx.config.schema;
        if (!overrides || Object.keys(overrides).length === 0) return schema;
        const newProps = {...schema.properties};
        for (const [fieldName, override] of Object.entries(overrides)) {
            if (newProps[fieldName]) {
                newProps[fieldName] = {...newProps[fieldName], ...override};
                // Merge widget overrides (partial)
                const o = override as {widget?: Record<string, unknown>};
                if (o.widget && newProps[fieldName].widget) {
                    newProps[fieldName] = {
                        ...newProps[fieldName],
                        widget: {
                            ...(newProps[fieldName].widget as object),
                            ...o.widget,
                        } as unknown as IEnrichedFieldSchema['widget'],
                    };
                }
            }
        }
        return {...schema, properties: newProps};
    }, [schema, designCtx.active, designCtx.config.schema]);

    const layoutResult = useLayout(effectiveSchema, effectiveCards, layout, layouts);
    const {cards} = layoutResult;

    /**
     * Tracks rows selected in table widgets with selectionMode: 'single'.
     * Key = field name; value = {row, index} (without __key) or null.
     */
    const [tableSelections, setTableSelections] = useState<
        Record<string, {row: Record<string, unknown>; index: number} | null>
    >({});

    const handleTableSelect = useCallback(
        (fieldName: string, selection: {row: Record<string, unknown>; index: number} | null) => {
            setTableSelections(prev => ({...prev, [fieldName]: selection}));
            onTableSelect?.(fieldName, selection);
        },
        [onTableSelect],
    );

    const {control, handleSubmit, reset, setError, getValues, setValue} = useForm<
        Record<string, unknown>
    >({
        // defaultValues: value ?? {},
        mode: 'onBlur',
    });

    // Sync external value changes (e.g. after fetch)
    useEffect(() => {
        if (value !== undefined) reset(value);
    }, [value, reset]);

    // Push server-side validation errors into react-hook-form
    useEffect(() => {
        if (!serverErrors) return;
        for (const [field, message] of Object.entries(serverErrors)) {
            setError(field, {type: 'server', message});
        }
    }, [serverErrors, setError]);

    const handleFormSubmit: SubmitHandler<Record<string, unknown>> = async data => {
        await onSubmit?.(data);
    };

    const handleFormInvalid = (fieldErrors: FieldErrors<Record<string, unknown>>) => {
        const count = Object.keys(fieldErrors).length;
        if (count === 0) return;
        useAppStore.getState().showToast({
            severity: 'error',
            summary: 'Validation error',
            detail:
                count === 1
                    ? 'Please correct the highlighted field.'
                    : `Please correct ${count} highlighted fields.`,
        });
    };

    const {debug} = useBlongUi();

    // ── Memoised context values ────────────────────────────────────────────────
    //
    // Stable context: values here almost never change during an edit session.
    // Keeping them separate means Card and Deck do not rerender while the user types.
    //
    // `control` and `setValue` are stable object refs returned by react-hook-form's
    // `useForm`; they never change identity across re-renders and are intentionally
    // omitted from the dependency array to avoid unnecessary useMemo invalidations.
    // `onChange` and `handleTableSelect` are stabilised at the Editor level via
    // `useCallback` so they too remain stable throughout the form's lifetime.
    const stableContextValue = useMemo(
        () => ({
            schema: effectiveSchema,
            cards,
            control,
            dropdowns,
            onChange,
            handleTableSelect,
            setValue,
            getValues,
            checkPermission,
            layoutResult,
            layout,
            formId,
            onLayoutChange,
        }),
        // control, setValue and getValues are excluded: see comment above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            effectiveSchema,
            cards,
            dropdowns,
            onChange,
            handleTableSelect,
            checkPermission,
            layoutResult,
            layout,
            formId,
            onLayoutChange,
        ],
    );

    // Slow-changing state: changes on user actions (row selection, save, edit toggle)
    // but NOT on every keystroke.
    const stateContextValue = useMemo(
        () => ({tableSelections, readOnly, loading}),
        [tableSelections, readOnly, loading],
    );

    // Layout rendering is delegated to the root Deck (id="root", no cardNames).
    // The root Deck reads layoutResult, layout, formId, and onLayoutChange from FormContext.
    // When debug mode is active, FormInspector is appended as an extra right panel showing
    // live form state (values, tableSelections, etc.) for inspection during development.
    const effectiveRightPanel = debug ? (
        <>
            {rightPanel}
            <FormInspector />
        </>
    ) : (
        rightPanel
    );

    const formBody = effectiveRightPanel ? (
        <div className="blong-form-layout">
            <form
                id={formId}
                onSubmit={handleSubmit(handleFormSubmit, handleFormInvalid)}
                className="blong-form"
                noValidate
            >
                <Deck id="root" />
            </form>
            {effectiveRightPanel}
        </div>
    ) : (
        <form
            id={formId}
            onSubmit={handleSubmit(handleFormSubmit, handleFormInvalid)}
            className="blong-form"
            noValidate
        >
            <Deck id="root" />
        </form>
    );

    return (
        <FormContext value={stableContextValue}>
            <FormStateContext value={stateContextValue}>{formBody}</FormStateContext>
        </FormContext>
    );
}
