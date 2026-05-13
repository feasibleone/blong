/**
 * FormContext — broadcasts react-hook-form state and configuration through
 * the Form component tree so Deck and Card can render without prop-drilling.
 *
 * To minimise rerendering, the context is split into two layers:
 *
 * - FormContext        (stable)   — schema, cards, control, layout config, callbacks.
 *                                   Never changes during a user's edit session; consumed
 *                                   by useBlongForm().
 * - FormStateContext   (slow)     — tableSelections, readOnly, loading.
 *                                   Changes only on user actions (row selection, save,
 *                                   edit-mode toggle); consumed by useBlongFormState().
 *
 * Card and Deck subscribe only to the stable context, so they do NOT rerender
 * while the user is typing.  FieldRow subscribes to the slow state context.
 * Validation errors are tracked per-field via react-hook-form's Controller
 * `fieldState.error` — no context broadcast is needed.
 */
import type {IEnrichedSchema} from '@feasibleone/blong';
import type React from 'react';
import {createContext, use} from 'react';
import type {Control, UseFormGetValues, UseFormSetValue} from 'react-hook-form';
import type {FlatLayoutConfig, ILayoutResult, IResolvedCard} from '../../hooks/useLayout.js';

// ── Custom editor types ───────────────────────────────────────────────────────

/**
 * Props injected into every custom editor component.
 * `Input` renders the widget for a named schema field.
 * `Label` renders the field's label.
 * `ErrorLabel` renders the field's validation error.
 */
export interface ICustomEditorProps {
    Input: React.ComponentType<{name: string; className?: string; fieldClass?: string}>;
    Label: React.ComponentType<{name?: string; className?: string; label?: string}>;
    ErrorLabel: React.ComponentType<{name?: string; className?: string}>;
}

/**
 * A custom editor component.
 * Must carry a static `properties` array listing the schema field names it covers.
 * These are used to correctly track visible fields and skip schema filtering.
 */
export type ICustomEditor = React.ComponentType<ICustomEditorProps> & {
    properties: string[];
};

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
    /**
     * Non-subscribing snapshot of the current form values. Stable reference from
     * react-hook-form — calling it always returns the latest values without causing
     * the caller to subscribe to future value changes.
     */
    getValues: UseFormGetValues<Record<string, unknown>>;
    checkPermission: ((permission: string) => boolean) | undefined;
    /**
     * Named method handlers for field-change dispatch and other programmatic actions.
     * Keyed by method name; each receives a params object and returns a Promise.
     */
    methods?: Record<string, (params: unknown) => Promise<unknown>>;
    /**
     * Default method name to call on every field change.
     * Individual fields can override this with `widget.onChange`.
     */
    onFieldChange?: string;

    /** Custom editor components, keyed by widget name used in card `widgets` arrays */
    editors?: Record<string, ICustomEditor>;

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
    return use(FormContext);
}

// ── Slow-changing state context (row selection, readOnly, loading) ────────────

export interface IFormStateContext {
    tableSelections: Record<string, ITableSelection | null>;
    readOnly: boolean;
    loading: boolean;
    /** Current editor mode — forwarded from the parent Editor for debug display */
    editorMode?: string;
    /** Effective resolved layout key — forwarded from the parent Editor for debug display */
    editorLayout?: string;
}

export const FormStateContext = createContext<IFormStateContext | null>(null);

/**
 * Returns the slow-changing form state context (tableSelections, readOnly, loading).
 * Components that only need these values will not rerender during typing.
 */
export function useBlongFormState(): IFormStateContext | null {
    return use(FormStateContext);
}
