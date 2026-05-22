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
import './Form.css';

import type {ICardConfig, IEnrichedFieldSchema, IEnrichedSchema} from '@feasibleone/blong';
import React, {useCallback, useEffect, useId, useMemo, useState} from 'react';
import {useForm, type FieldErrors, type SubmitHandler} from 'react-hook-form';
import {useBlongUi} from '../../context/BlongUiContext.js';
import {FormInspector, useDesignMode} from '../../design/index.js';
import {useLayout, type FlatLayoutConfig, type LayoutConfig} from '../../hooks/useLayout.js';
import {useAppStore} from '../../state/appStore.js';
import {Deck} from '../Deck/Deck.js';
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
     * Called whenever the form's dirty state changes (false → true or true → false).
     * Backed by react-hook-form's `formState.isDirty` so it fires only on transitions,
     * not on every keystroke.
     */
    onDirtyChange?: (isDirty: boolean) => void;
    /**
     * Increment this counter to imperatively reset the form to its current `value`.
     * Useful when the parent needs to discard edits without changing the `value` prop reference
     * (e.g. the Editor's Reset button when no save has occurred and `value` hasn't changed).
     * The initial value of 0 is ignored — only increments trigger a reset.
     */
    resetKey?: number;
    /**
     * Optional side panel rendered alongside the form (e.g. the design inspector).
     * Rendered inside FormContext.Provider but outside the <form> element so its
     * inputs do not participate in form submission.
     */
    rightPanel?: React.ReactNode;
    /**
     * Named method handlers available to field widgets via `widget.onChange` or `onFieldChange`.
     * Each method receives `{field, value, form}` and returns a Promise.
     * Returning `false` from a method aborts the field change.
     */
    methods?: Record<string, (params: unknown) => Promise<unknown>>;
    /**
     * Default method name to call on every field change (can be overridden per-field via `widget.onChange`).
     */
    onFieldChange?: string;
    /**
     * Custom editor components, keyed by the widget name used in card `widgets` arrays.
     * Each component receives `Input`, `Label`, and `ErrorLabel` factory components and
     * must declare a static `properties` array listing the schema fields it covers.
     */
    editors?: Record<string, import('./FormContext.js').ICustomEditor>;
    /**
     * Current editor mode passed down from the Editor for display in the Form Inspector.
     * Does not affect form behaviour — purely informational.
     */
    editorMode?: string;
    /**
     * Resolved layout key passed down from the Editor for display in the Form Inspector.
     * Does not affect form behaviour — purely informational.
     */
    editorLayout?: string;
    /**
     * When true, signals that the Editor is in "report" mode.
     * Table widgets will not fetch until `reportParams` is non-undefined.
     */
    reportMode?: boolean;
    /**
     * Filter params submitted by the report's "Run Report" button.
     * Set after the first run; undefined means no report has been run yet.
     */
    reportParams?: Record<string, unknown>;
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
    onDirtyChange,
    resetKey,
    rightPanel,
    methods,
    onFieldChange,
    editors,
    editorMode,
    editorLayout,
    reportMode,
    reportParams,
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

    const layoutResult = useLayout(effectiveSchema, effectiveCards, layout, layouts, editors);
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

    const {control, handleSubmit, reset, setError, getValues, setValue, formState} = useForm<
        Record<string, unknown>
    >({
        // defaultValues: value ?? {},
        mode: 'onBlur',
    });

    // Notify parent when the dirty state transitions (false→true or true→false).
    // formState.isDirty is a Proxy-backed property in react-hook-form — subscribing to it
    // here causes Form to re-render only on dirty-state transitions, not on every keystroke.
    // `onDirtyChange` should be a stable reference (e.g. a useState setter) to avoid
    // unnecessary effect re-runs.
    useEffect(() => {
        onDirtyChange?.(formState.isDirty);
    }, [formState.isDirty, onDirtyChange]);

    // Sync external value changes (e.g. after fetch)
    useEffect(() => {
        if (value !== undefined) reset(value);
    }, [value, reset]);

    // Imperative reset: when the parent increments `resetKey`, discard the user's edits
    // and restore the form to its current `value` prop.  This is needed when `value` hasn't
    // changed (e.g. the Editor's Reset button before any save) so the value-sync effect above
    // would not re-run on its own.  resetKey = 0 is the initial value and is ignored.
    useEffect(() => {
        if (resetKey === undefined || resetKey === 0) return;
        reset(value ?? {});
        // `value` and `reset` intentionally omitted: this effect should fire only when
        // resetKey changes, not whenever value changes (the effect above handles that).
        // eslint-disable-next-line @eslint-react/exhaustive-deps
    }, [resetKey]);

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
            methods,
            onFieldChange,
            editors,
        }),
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
            methods,
            onFieldChange,
            editors,
            control,
            getValues,
            setValue,
        ],
    );

    // Slow-changing state: changes on user actions (row selection, save, edit toggle)
    // but NOT on every keystroke.
    const stateContextValue = useMemo(
        () => ({tableSelections, readOnly, loading, editorMode, editorLayout, reportMode, reportParams}),
        [tableSelections, readOnly, loading, editorMode, editorLayout, reportMode, reportParams],
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
