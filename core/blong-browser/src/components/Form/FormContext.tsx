/**
 * FormContext — broadcasts react-hook-form state and configuration through
 * the Form component tree so Deck and Card can render without prop-drilling.
 *
 * To minimise rerendering, the context is split into three layers:
 *
 * - FormContext        (stable)   — schema, cards, control, layout config, callbacks.
 *                                   Never changes during a user's edit session; consumed
 *                                   by useBlongForm().
 * - FormStateContext   (slow)     — tableSelections, readOnly, loading.
 *                                   Changes only on user actions (row selection, save,
 *                                   edit-mode toggle); consumed by useBlongFormState().
 * - FormValuesContext  (fast)     — rawFormValues, formValues, errors.
 *                                   Changes on every field-value change (typing);
 *                                   consumed by useFormValues().
 *
 * Card and Deck subscribe only to stable + slow contexts, so they do NOT rerender
 * while the user is typing.  FieldRow and WatchFieldRow subscribe to the fast context
 * so individual field rows update in response to value changes.
 */
import type {IEnrichedSchema} from '@feasibleone/blong';
import {createContext, useContext} from 'react';
import type {Control, FieldErrors, UseFormSetValue} from 'react-hook-form';
import type {FlatLayoutConfig, ILayoutResult, IResolvedCard} from '../../hooks/useLayout.js';

export interface ITableSelection {
    row: Record<string, unknown>;
    index: number;
}

// ── Stable context (never changes while the user is editing) ─────────────────

export interface IFormContext {
    schema: IEnrichedSchema | undefined;
    /** Resolved card map produced by useLayout */
    cards: Record<string, IResolvedCard>;
    control: Control<Record<string, unknown>>;
    dropdowns: Record<string, {value: unknown; label: string}[]> | undefined;
    onChange: ((value: Record<string, unknown>) => void) | undefined;
    handleTableSelect: (fieldName: string, selection: ITableSelection | null) => void;
    setValue: UseFormSetValue<Record<string, unknown>>;
    checkPermission: ((permission: string) => boolean) | undefined;

    // ── Layout fields — consumed by the root Deck ─────────────────────────
    layoutResult: ILayoutResult;
    /** Active layout key */
    layout: string;
    /** Form element id — needed by Steps submit button */
    formId: string;
    /** Called when the user reorders cards in design mode */
    onLayoutChange?: (layoutKey: string, newLayout: FlatLayoutConfig) => void;
}

export const FormContext = createContext<IFormContext | null>(null);

/**
 * Returns the stable form context, or null when called outside a Form.
 * Deck and Card use the null return to decide whether to operate in
 * context-driven mode or children-passthrough mode.
 */
export function useBlongForm(): IFormContext | null {
    return useContext(FormContext);
}

// ── Slow-changing state context (row selection, readOnly, loading) ────────────

export interface IFormStateContext {
    tableSelections: Record<string, ITableSelection | null>;
    readOnly: boolean;
    loading: boolean;
}

export const FormStateContext = createContext<IFormStateContext | null>(null);

/**
 * Returns the slow-changing form state context (tableSelections, readOnly, loading).
 * Components that only need these values will not rerender during typing.
 */
export function useBlongFormState(): IFormStateContext | null {
    return useContext(FormStateContext);
}

// ── Fast-changing values context (changes on every keystroke) ─────────────────

export interface IFormValuesContext {
    /** Raw react-hook-form values (from watch()) */
    rawFormValues: Record<string, unknown>;
    errors: FieldErrors<Record<string, unknown>>;
}

export const FormValuesContext = createContext<IFormValuesContext | null>(null);

/**
 * Returns the fast-changing form values context (rawFormValues, formValues, errors).
 * Only FieldRow / WatchFieldRow subscribe here, so rerenders stay scoped to individual fields.
 */
export function useFormValues(): IFormValuesContext | null {
    return useContext(FormValuesContext);
}
