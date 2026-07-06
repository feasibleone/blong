/**
 * Editor — Form + toolbar + lifecycle wrapper.
 *
 * Wires a Form to load/save actions, renders a configurable toolbar,
 * and manages edit/read-only toggling. Designed to edit a single entity.
 */
import {confirmPopup, OverlayPanel, Toolbar} from '../../primereact/index.js';

import type {ICardConfig, IEnrichedSchema} from '@feasibleone/blong';
import {useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {DesignModeProvider} from '../../design/DesignModeContext.js';
import {
    DesignAddCardButton,
    DesignAddFieldButton,
    PropertyEditor,
} from '../../design/PropertyEditor.js';
import {useAction} from '../../hooks/useAction.js';
import {type FlatLayoutConfig, type LayoutConfig} from '../../hooks/useLayout.js';
import type {IToolbarButton} from '../../index.js';
import {useAppStore} from '../../state/appStore.js';
import type {IBlongError} from '../../types/action.js';
import {ActionButton} from '../ActionButton/ActionButton.js';
import {Form} from '../Form/Form.js';
import type {ITableSelection} from '../Form/FormContext.js';

export interface IEditorProps {
    /** Schema for the entity being edited */
    schema?: IEnrichedSchema;
    /** Card configuration */
    cards?: Record<string, ICardConfig>;
    /** Active layout key */
    layout?: string;
    layouts?: Record<string, LayoutConfig>;

    /** Static initial value (skips loadAction when provided) */
    value?: Record<string, unknown>;

    /** Action name for loading the entity; result populates the form */
    loadAction?: string;
    /** Params for the load action */
    loadParams?: Record<string, unknown>;

    /** Action name for saving changed data (edit mode) */
    saveAction?: string;
    /**
     * Action name for creating new records (mode='new').
     * Falls back to `saveAction` when not provided.
     */
    createAction?: string;
    /** Called with the saved value on successful save */
    onSave?: (value: Record<string, unknown>) => void;

    /** Static dropdown data keyed by dropdown name — bypasses dispatch */
    dropdowns?: Record<string, {value: unknown; label: string}[]>;

    /** Toolbar buttons (left side) */
    toolbar?: IToolbarButton[];
    /** Toolbar buttons (right side) */
    toolbarRight?: IToolbarButton[];

    /**
     * Initial editor mode.
     * - `'new'`  — editable, save creates a new record then switches to `'edit'`
     * - `'view'` — read-only; an Edit button appears when `editable` is true
     * - `'edit'` — editable, save updates the existing record
     */
    mode?: EditorMode;
    /**
     * @deprecated Use `mode` instead.
     * When `true`, equivalent to `mode="edit"`; when `false`, equivalent to `mode="view"`.
     */
    editMode?: boolean;
    /** Allow user to toggle from view to edit mode */
    editable?: boolean;
    /** Show design mode toggle cog button on the toolbar right side */
    designable?: boolean;
    /** Start in design mode (requires designable=true) */
    initialDesignMode?: boolean;
    /** Permission check passed to the form; cards with a permission key are only shown if this returns true */
    checkPermission?: (permission: string) => boolean;
    /**
     * Named method handlers for field-change dispatch.
     * Each receives `{field, value, form}` and returns a Promise.
     * Returning `false` aborts the field change.
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
    editors?: Record<string, import('../Form/FormContext.js').ICustomEditor>;

    className?: string;

    /**
     * Per-mode tab titles, keyed by `EditorMode` (`'new'`, `'edit'`, `'view'`).
     * Overrides the default title derived from `resolveTabTitle(mode, resolvedLayout)`.
     *
     * Using a plain object (instead of a function) keeps the value JSON-serializable so
     * it can be stored in model specs and user customisations without embedding JS code,
     * and each string is a discrete unit that can be looked up in a translation dictionary.
     *
     * Example: `title: {new: 'Create Coral', edit: 'Edit Coral'}`
     *
     * A bare string may also be passed when the title is the same across all modes.
     */
    title?: string | Record<string, string>;
    /**
     * Portal tab ID. When provided, the Editor keeps the tab title in sync with the
     * current mode via `setTabTitle`. Injected automatically by the Portal when it
     * renders tab components (`<tab.component tabId={tab.id} {...tab.params} />`).
     */
    tabId?: string;
    /**
     * TanStack Query namespace prefix for cache invalidation.
     * When set, clicking `__refresh__` in the toolbar invalidates all queries
     * whose key starts with `{refreshNamespace}.`. Auto-set by `subjectObjectBrowse`
     * to `{subject}.{object}` (e.g. `'marine.coral'`).
     */
    refreshNamespace?: string;
    /**
     * Action name to call when the "Run Report" button is clicked.
     * When set, the Editor enters "report" mode:
     * - No Save / Reset buttons; only a "Run Report" submit button.
     * - On form submit the form values are passed as `reportParams` to the table widget
     *   (via FormStateContext) so the table re-fetches with those params.
     * - The form is always editable (params input).
     */
    queryAction?: string;
}

/** Editor interaction mode. */
export type EditorMode = 'new' | 'view' | 'edit';

function deriveInitialMode(mode?: EditorMode, editMode?: boolean): EditorMode {
    if (mode !== undefined) return mode;
    return editMode ? 'edit' : 'view';
}

/**
 * Derive effective layout key from mode and layout name with sensible fallbacks.
 *
 * Resolution order:
 * 1. `{mode}{Capital(layout)}` — e.g. `editDefault`, `newDefault`, `viewDefault`
 * 2. For non-edit modes: `edit{Capital(layout)}` — e.g. `editDefault`
 * 3. `layout` as-is — e.g. `default`
 */
function resolveLayoutKey(
    mode: EditorMode,
    layout: string,
    layouts?: Record<string, LayoutConfig>,
): string {
    if (!layouts) return layout;
    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
    const modeKey = mode + cap(layout);
    if (modeKey in layouts) return modeKey;
    if (mode !== 'edit') {
        const editKey = 'edit' + cap(layout);
        if (editKey in layouts) return editKey;
    }
    return layout;
}

/**
 * Derive a display title from the current mode and resolved layout key.
 *
 * Splits the layout key at capital-letter boundaries and capitalises each word.
 * When the layout starts with the current mode the mode word is used directly;
 * otherwise only the capitalized mode is returned.
 *
 * Examples:
 *   ('edit', 'editSplit')       → 'Edit Split'
 *   ('edit', 'editThumbIndex')  → 'Edit Thumb Index'
 *   ('new',  'edit')            → 'New'   (mode != layout prefix → no suffix)
 *   ('view', 'viewDefault')     → 'View'  ('default' suffix filtered out)
 */
export function resolveTabTitle(mode: EditorMode, resolvedLayout: string): string {
    const words = resolvedLayout
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .split(/\s+/);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    // If the layout key starts with the mode, use trailing words as suffix
    const suffix: string[] =
        words[0]?.toLowerCase() === mode
            ? words.slice(1).filter(w => w.toLowerCase() !== 'default')
            : [];
    const modeTitle = cap(mode);
    return suffix.length ? `${modeTitle} ${suffix.map(cap).join(' ')}` : modeTitle;
}

const backgroundNone = {background: 'none'};

// ── Template resolution (mirrors Explorer's resolveTemplate) ──────────────────

function getPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const part of parts) {
        if (cur === null || cur === undefined) return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

function resolveTemplate(
    params: Record<string, unknown> | string | undefined,
    context: Record<string, unknown>,
): Record<string, unknown> | undefined {
    if (params === undefined || params === null) return undefined;
    if (typeof params === 'string') {
        // Use [^{}]+ instead of [^}]+ to prevent ReDoS on deeply-nested inputs
        const singleExpr = params.trim().match(/^\$\{([^{}]+)\}$/);
        if (singleExpr) {
            const val = getPath(context, (singleExpr[1] as string).trim());
            if (val !== null && typeof val === 'object') return val as Record<string, unknown>;
            return {value: val};
        }
        const resolved = params.replace(/\$\{([^{}]+)\}/g, (_, expr: string) => {
            const v = getPath(context, expr.trim());
            return v === undefined || v === null
                ? ''
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v);
        });
        return {value: resolved};
    }
    return Object.fromEntries(
        Object.entries(params).map(([k, v]) => {
            if (typeof v === 'string') {
                const r = resolveTemplate(v, context);
                return [k, r?.value !== undefined ? r.value : r];
            }
            return [k, v];
        }),
    );
}

function evalEnabled(
    enabled: IToolbarButton['enabled'],
    currentRow: Record<string, unknown> | null,
    selectedRows: Record<string, unknown>[],
    isDirty: boolean,
): boolean {
    if (enabled === 'current') return currentRow !== null;
    if (enabled === 'selected') return selectedRows.length > 0;
    if (enabled === 'dirty') return isDirty;
    if (enabled === 'clean') return !isDirty;
    return enabled !== false;
}

export function Editor({
    schema,
    cards,
    layout = 'default',
    layouts,
    value: staticValue,
    loadAction,
    loadParams,
    saveAction,
    createAction,
    onSave,
    dropdowns,
    toolbar = [],
    toolbarRight = [],
    mode: initialModeProp,
    editMode: initialEditMode = false,
    editable = true,
    designable = false,
    initialDesignMode = false,
    checkPermission,
    methods,
    onFieldChange,
    editors,
    className = 'blong-editor',
    title: titleProp,
    tabId,
    refreshNamespace,
    queryAction,
}: IEditorProps) {
    const formId = useId();
    const [currentMode, setCurrentMode] = useState<EditorMode>(() =>
        deriveInitialMode(initialModeProp, initialEditMode),
    );
    // 'new' and 'edit' modes are both editable; 'view' is read-only
    const editMode = currentMode !== 'view';
    const [localValue, setLocalValue] = useState<Record<string, unknown> | undefined>(undefined);
    const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>(undefined);
    const [isDirty, setIsDirty] = useState(false);
    /** Incremented by doReset to imperatively reset the Form's RHF state to the current value */
    const [formResetKey, setFormResetKey] = useState(0);
    /** Whether the last save succeeded and the form hasn't been touched since */
    const [savedSuccess, setSavedSuccess] = useState(false);
    /** Number of in-flight toolbar button calls — form is read-only while > 0 */
    const [toolbarBusy, setToolbarBusy] = useState(0);
    const handleToolbarBusy = useCallback((busy: boolean) => {
        setToolbarBusy(n => n + (busy ? 1 : -1));
    }, []);
    /** error.print from the last failed save — shown in OverlayPanel anchored to save button */
    const [validationHint, setValidationHint] = useState<string | undefined>(undefined);
    const saveButtonRef = useRef<HTMLButtonElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const hintOverlayRef = useRef<OverlayPanel>(null);
    const [designMode, setDesignMode] = useState(designable && initialDesignMode);
    // Mutable copy of layouts — updated when the user reorders cards in design mode
    const [localLayouts, setLocalLayouts] = useState<Record<string, LayoutConfig> | undefined>(
        () => layouts,
    );
    /**
     * Report params submitted by the "Run Report" button.
     * Undefined until the first report run; set to the submitted form values on each run.
     * Passed to Form → FormStateContext → TableWidget to trigger a re-fetch with new filter params.
     */
    const [reportParams, setReportParams] = useState<Record<string, unknown> | undefined>(
        undefined,
    );
    const isReportMode = !!queryAction;

    // ── Table selection tracking (for toolbar button enabled/params resolution) ──
    /**
     * Per-field table selection tracking for toolbar button enabled/params resolution.
     * Only table widgets (not navigator) contribute to toolbar context.
     */
    const [tableSelections, setTableSelections] = useState<Record<string, ITableSelection | null>>(
        {},
    );
    const [lastTableFieldName, setLastTableFieldName] = useState<string | null>(null);

    /**
     * Returns true if the field drives the Editor toolbar context.
     * Navigator widgets publish selections for cascade filtering only —
     * all other array-field widgets (table, etc.) update toolbar context.
     */
    const isTableWidget = useCallback(
        (fieldName: string): boolean => {
            const widgetType = schema?.properties?.[fieldName]?.widget?.type;
            // Explicitly exclude navigator; all other widget types (table, default) drive toolbar
            return widgetType !== 'navigator';
        },
        [schema?.properties],
    );

    // Use functional state updates so this callback does not close over `lastTableFieldName`
    // state — keeping a stable reference prevents unnecessary FormStableContext updates.
    const handleTableSelect = useCallback(
        (fieldName: string, selection: ITableSelection | null) => {
            // Skip navigator widget selections — they drive cascade filtering, not toolbar context
            if (!isTableWidget(fieldName)) return;
            setTableSelections(prev => ({...prev, [fieldName]: selection}));
            setLastTableFieldName(prev => {
                if (selection) return fieldName;
                if (prev === fieldName) return null;
                return prev;
            });
        },
        [isTableWidget],
    );

    /** Template context derived from the most recent non-null table widget selection */
    const lastRow = lastTableFieldName ? (tableSelections[lastTableFieldName]?.row ?? null) : null;
    const selectionContext: Record<string, unknown> = {
        id: lastRow?.id,
        current: lastRow,
        selected: lastRow ? [lastRow] : [],
        ...(lastRow ?? {}),
    };

    // Resolved layout key — applies mode-based fallback: `{mode}{Capital(layout)}` → `edit{Capital(layout)}` → `layout`
    const resolvedLayout = resolveLayoutKey(currentMode, layout, localLayouts ?? layouts);

    // ── Tab title synchronisation ──────────────────────────────────────────────
    // Use a ref for titleProp so the effect does not re-run when the caller
    // passes an inline object (new identity on every render).  The effect only
    // needs to re-run when the *computed* title string would actually change,
    // which is driven by currentMode and resolvedLayout — not by object identity.
    const titlePropRef = useRef(titleProp);
    titlePropRef.current = titleProp;

    const setTabTitleStore = useAppStore(s => s.setTabTitle);
    useEffect(() => {
        if (!tabId || !setTabTitleStore) return;
        const tp = titlePropRef.current;
        const computedTitle =
            tp === null || tp === undefined
                ? resolveTabTitle(currentMode, resolvedLayout)
                : typeof tp === 'string'
                  ? tp
                  : (tp[currentMode] ?? resolveTabTitle(currentMode, resolvedLayout));
        setTabTitleStore(tabId, computedTitle);
        // titlePropRef is intentionally omitted from deps — we read it via ref to avoid
        // re-running when the caller re-creates the object on every render.
    }, [tabId, currentMode, resolvedLayout, setTabTitleStore]);

    // Callback passed to DesignAddCardButton: adds the new card name to localLayouts
    const handleCardAdded = useCallback(
        (name: string) => {
            setLocalLayouts(prev => {
                // Use the currently resolved layout key so cards land in the right layout config
                const key = resolveLayoutKey(currentMode, layout, prev ?? layouts);
                const cur = prev?.[key];
                const flat: FlatLayoutConfig = Array.isArray(cur)
                    ? [...(cur as FlatLayoutConfig)]
                    : [];
                return {...(prev ?? {}), [key]: [...flat, name] as FlatLayoutConfig};
            });
        },
        [currentMode, layout, layouts],
    );

    // Stable onChange passed to Form so FormStableContext is not invalidated on every render.
    // Do NOT call setLocalValue or setIsDirty here — both would trigger an Editor re-render on
    // every keystroke and cause Form to re-render too. Dirty-state is tracked via
    // onDirtyChange (backed by react-hook-form's formState.isDirty) which fires only on
    // transitions, not on every keystroke.
    const handleFormChange = useCallback(() => {
        setSavedSuccess(false);
        setValidationHint(undefined);
    }, []);

    // Stable onLayoutChange callback for design mode.
    const handleLayoutChange = useCallback((key: string, newLayout: FlatLayoutConfig) => {
        setLocalLayouts(prev => ({...(prev ?? {}), [key]: newLayout as FlatLayoutConfig}));
    }, []);

    // Load action (skipped when static value is provided)
    const loader = useAction<Record<string, unknown>>(
        staticValue ? '' : (loadAction ?? ''),
        'query',
        loadParams,
    );
    const entityValue = localValue ?? staticValue ?? loader.data ?? undefined;

    const queryClient = useQueryClient();

    // Creator action — used in 'new' mode; falls back to saveAction when createAction is not provided
    const creator = useAction(createAction ?? saveAction ?? '', 'mutation');
    // Saver action — used in 'edit' mode
    const saver = useAction(saveAction ?? '', 'mutation');
    // Active saver and loading state based on current mode
    const activeSaver = currentMode === 'new' ? creator : saver;
    const activeSaving = creator.loading || saver.loading;

    // Show/hide the validation hint overlay when validationHint changes
    useEffect(() => {
        if (validationHint && saveButtonRef.current) {
            hintOverlayRef.current?.show(null, saveButtonRef.current);
        } else {
            hintOverlayRef.current?.hide();
        }
    }, [validationHint]);

    const handleSubmit = async (formValue: Record<string, unknown>) => {
        // ── Report mode: update params to trigger table re-fetch ──────────
        if (isReportMode) {
            setReportParams(formValue);
            return;
        }

        setServerErrors(undefined);
        const isCreate = currentMode === 'new';
        try {
            const result = (await activeSaver.call(formValue)) as
                | Record<string, unknown>
                | undefined;
            // Use the server-returned value — the back end may apply side-effect updates
            // (timestamps, computed fields, etc.) that the client form does not know about.
            const savedValue = result ?? formValue;
            setLocalValue(savedValue);
            setIsDirty(false);
            setSavedSuccess(true);
            // After creating a new record, switch to edit mode and reset the RHF baseline
            // so the saved value (with server-assigned ID) becomes the new clean state.
            if (isCreate) {
                setCurrentMode('edit');
                setFormResetKey(k => k + 1);
            }
            setValidationHint(undefined);
            onSave?.(savedValue);
            // Invalidate browse/list queries so any open browse tab refreshes automatically.
            // Derive the namespace from the action that was just called.
            const actionUsed = isCreate ? (createAction ?? saveAction) : saveAction;
            const ns = actionUsed?.split('.').slice(0, -1).join('.');
            if (ns) {
                void queryClient.invalidateQueries({queryKey: [ns + '.find']});
                void queryClient.invalidateQueries({queryKey: [ns + '.get']});
            }
        } catch (err: unknown) {
            const blongErr = err as Partial<IBlongError>;
            if (Array.isArray(blongErr?.validation)) {
                const fieldErrors: Record<string, string> = {};
                for (const {field, message} of blongErr.validation) {
                    fieldErrors[field] = message;
                }
                setServerErrors(fieldErrors);
                // Show error.print as a popup anchored to the save button
                if (blongErr.print) setValidationHint(blongErr.print);
            }
        }
    };

    // Build default toolbar buttons based on current mode
    const leftButtons: IToolbarButton[] = [
        // Report mode — show "Run Report" instead of Save/Edit/Reset
        ...(isReportMode
            ? [{label: 'Run Report', icon: 'pi pi-play', submit: true, title: 'Run Report'}]
            : [
                  // 'view' mode + editable — show Edit button to enter edit mode
                  ...(editable && currentMode === 'view'
                      ? [{label: 'Edit', icon: 'pi pi-pencil', action: '__edit__'}]
                      : []),
                  // 'new' and 'edit' modes — show Save + Reset buttons
                  ...(editMode
                      ? [
                            {
                                label: 'Save',
                                icon: savedSuccess ? 'pi pi-check' : 'pi pi-save',
                                submit: true,
                                action: '__save__',
                            },
                            {label: 'Reset', icon: 'pi pi-replay', action: '__cancel__'},
                        ]
                      : []),
              ]),
        ...toolbar,
    ];

    // Right side: custom buttons + optional design cog
    const rightButtons: IToolbarButton[] = [
        ...toolbarRight,
        ...(designable ? [{label: 'Design', icon: 'pi pi-cog', action: '__design__'}] : []),
    ];

    /** True while any toolbar action or save is in-flight — disables all remaining buttons */
    const globalBusy = toolbarBusy > 0 || activeSaving;

    const handleToolbarAction = (actionName: string) => {
        if (actionName === '__edit__') setCurrentMode('edit');
        if (actionName === '__design__') setDesignMode(d => !d);
        if (actionName === '__refresh__' && refreshNamespace) {
            void queryClient.invalidateQueries({
                predicate: q =>
                    typeof q.queryKey[0] === 'string' &&
                    (q.queryKey[0] as string).startsWith(refreshNamespace + '.'),
            });
        }
        if (actionName === '__cancel__') {
            const doReset = () => {
                setLocalValue(undefined);
                setIsDirty(false);
                setSavedSuccess(false);
                setValidationHint(undefined);
                setCurrentMode(deriveInitialMode(initialModeProp, initialEditMode));
                // Increment resetKey to force Form to call RHF's reset() even when
                // entityValue hasn't changed (e.g. user edited without saving first,
                // so localValue was always undefined and value prop never changed).
                setFormResetKey(k => k + 1);
            };
            if (isDirty) {
                confirmPopup({
                    target: cancelButtonRef.current!,
                    message: 'Changed data will not be saved. Are you sure you want to proceed?',
                    icon: 'pi pi-exclamation-triangle',
                    accept: doReset,
                });
            } else {
                doReset();
            }
        }
    };

    /** Render a custom ActionButton with selection-aware enabled/params resolution */
    const renderActionBtn = (btn: IToolbarButton, i: number) => {
        const resolvedParams = resolveTemplate(btn.params, selectionContext);
        const resolvedDisabled =
            globalBusy ||
            !evalEnabled(
                btn.enabled,
                selectionContext.current as Record<string, unknown> | null,
                selectionContext.selected as Record<string, unknown>[],
                isDirty,
            );
        const resolvedBtn: IToolbarButton =
            resolvedParams != null ? {...btn, params: resolvedParams} : btn;
        return (
            <ActionButton
                key={i}
                {...resolvedBtn}
                disabled={resolvedDisabled}
                formId={formId}
                className="mr-2"
                onBusyChange={handleToolbarBusy}
            />
        );
    };

    const leftContent = (
        <div className="blong-toolbar-left">
            {leftButtons.map((btn, i) => {
                const actionName =
                    typeof btn.action === 'string' ? btn.action : (btn.action?.method ?? '');
                const isDisabled =
                    (actionName === '__save__' || actionName === '__cancel__') &&
                    (!isDirty || activeSaving || toolbarBusy > 0);
                if (
                    actionName === '__edit__' ||
                    actionName === '__cancel__' ||
                    actionName === '__refresh__'
                ) {
                    const testIdSuffix = actionName.replace(/__/g, '');
                    return (
                        <button
                            ref={actionName === '__cancel__' ? cancelButtonRef : undefined}
                            // eslint-disable-next-line @eslint-react/no-array-index-key
                            key={i}
                            type="button"
                            className={`p-button p-component p-button-icon-only mr-2${isDisabled ? ' p-disabled' : ''}`}
                            aria-label={btn.label || btn.title}
                            title={btn.title}
                            disabled={isDisabled}
                            data-testid={`editor-${testIdSuffix}`}
                            onClick={() => handleToolbarAction(actionName)}
                        >
                            {btn.icon && <span className={`p-button-icon p-c pi ${btn.icon}`} />}
                            <span className="p-button-label p-c">&nbsp;</span>
                        </button>
                    );
                }
                if (actionName === '__save__') {
                    return (
                        <button
                            ref={saveButtonRef}
                            // eslint-disable-next-line @eslint-react/no-array-index-key
                            key={i}
                            type="submit"
                            form={formId}
                            className={`p-button p-component p-button-icon-only mr-2${isDisabled ? ' p-disabled' : ''}`}
                            aria-label={btn.label}
                            disabled={isDisabled}
                            data-testid="editor-save"
                        >
                            {btn.icon && (
                                <span
                                    className={`p-button-icon p-c pi ${activeSaving || toolbarBusy > 0 ? 'pi-spin pi-spinner' : btn.icon}`}
                                />
                            )}
                            <span className="p-button-label p-c">&nbsp;</span>
                        </button>
                    );
                }
                return renderActionBtn(btn, i);
            })}
        </div>
    );

    const rightContent =
        rightButtons.length > 0 ? (
            <div className="blong-toolbar-right">
                {rightButtons.map((btn, i) => {
                    const actionName =
                        typeof btn.action === 'string' ? btn.action : (btn.action?.method ?? '');
                    if (actionName === '__design__') {
                        return (
                            <span
                                // eslint-disable-next-line @eslint-react/no-array-index-key
                                key={i}
                                className="blong-design-toolbar"
                            >
                                <button
                                    type="button"
                                    className={`p-button p-component p-button-icon-only${designMode ? ' p-button-success' : ''}`}
                                    aria-label={btn.label}
                                    aria-pressed={designMode}
                                    onClick={() => handleToolbarAction(actionName)}
                                >
                                    <span
                                        className={`p-button-icon p-c pi ${designMode ? 'pi-check' : 'pi-cog'}`}
                                    />
                                    <span className="p-button-label p-c">&nbsp;</span>
                                </button>
                                {designMode && (
                                    <>
                                        <DesignAddCardButton onCardAdded={handleCardAdded} />
                                        <DesignAddFieldButton
                                            schema={schema as Record<string, unknown>}
                                            cards={cards as Record<string, unknown>}
                                        />
                                    </>
                                )}
                            </span>
                        );
                    }
                    return renderActionBtn(btn, i);
                })}
            </div>
        ) : undefined;

    const editorContent = (
        <div
            className={className}
            data-testid="blong-browser-test"
        >
            <OverlayPanel
                ref={hintOverlayRef}
                className="blong-validation-hint"
                style={{maxWidth: 320}}
            >
                <span className="p-error">{validationHint}</span>
            </OverlayPanel>
            {(leftButtons.length > 0 || rightButtons.length > 0) && (
                <Toolbar
                    left={leftContent}
                    right={rightContent}
                    className="border-none border-bottom-1 border-50 p-2"
                    style={backgroundNone}
                />
            )}
            <Form
                id={formId}
                schema={schema}
                cards={cards}
                layout={resolvedLayout}
                layouts={localLayouts}
                value={entityValue}
                onChange={handleFormChange}
                onSubmit={isReportMode || saveAction || createAction ? handleSubmit : undefined}
                onDirtyChange={setIsDirty}
                resetKey={formResetKey}
                onTableSelect={handleTableSelect}
                readOnly={
                    isReportMode
                        ? false
                        : !editMode || activeSaving || toolbarBusy > 0 || loader.loading
                }
                loading={loader.loading}
                serverErrors={serverErrors}
                checkPermission={checkPermission}
                methods={methods}
                editors={editors}
                onFieldChange={onFieldChange}
                dropdowns={dropdowns}
                onLayoutChange={designMode ? handleLayoutChange : undefined}
                rightPanel={designable ? <PropertyEditor /> : undefined}
                editorMode={currentMode}
                editorLayout={resolvedLayout}
                reportMode={isReportMode}
                reportParams={reportParams}
            />
        </div>
    );

    if (!designable) return editorContent;

    return (
        <DesignModeProvider
            active={designMode}
            initialConfig={{cards: cards ?? {}, layouts: localLayouts ?? {}}}
        >
            {editorContent}
        </DesignModeProvider>
    );
}
