/**
 * FormContext — broadcasts react-hook-form state and configuration through
 * the Form component tree so Deck and Card can render without prop-drilling.
 *
 * Consumed via useBlongForm(). Returns null outside a Form — Deck and Card
 * fall back to children-passthrough mode when the context is absent.
 */
import type {IEnrichedSchema} from '@feasibleone/blong';
import {createContext, useContext} from 'react';
import type {Control, FieldErrors, UseFormSetValue} from 'react-hook-form';
import type {FlatLayoutConfig, ILayoutResult, IResolvedCard} from '../../hooks/useLayout.js';

export interface ITableSelection {
    row: Record<string, unknown>;
    index: number;
}

export interface IFormContext {
    schema: IEnrichedSchema | undefined;
    /** Resolved card map produced by useLayout */
    cards: Record<string, IResolvedCard>;
    control: Control<Record<string, unknown>>;
    errors: FieldErrors<Record<string, unknown>>;
    /** Raw react-hook-form values (from watch()) */
    rawFormValues: Record<string, unknown>;
    /** Extended values — raw values + __sel_{field} table-selection pseudo-fields */
    formValues: Record<string, unknown>;
    readOnly: boolean;
    loading: boolean;
    dropdowns: Record<string, {value: unknown; label: string}[]> | undefined;
    onChange: ((value: Record<string, unknown>) => void) | undefined;
    tableSelections: Record<string, ITableSelection | null>;
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
 * Returns the nearest Form's context, or null when called outside a Form.
 * Deck and Card use the null return to decide whether to operate in
 * context-driven mode or children-passthrough mode.
 */
export function useBlongForm(): IFormContext | null {
    return useContext(FormContext);
}
