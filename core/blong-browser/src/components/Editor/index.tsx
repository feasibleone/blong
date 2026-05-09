/**
 * Editor — Form + toolbar + lifecycle wrapper.
 *
 * Wires a Form to load/save actions, renders a configurable toolbar,
 * and manages edit/read-only toggling. Designed to edit a single entity.
 */
import {confirmPopup, OverlayPanel, Toolbar} from '../../primereact/index.js';

import type {ICardConfig, IEnrichedSchema} from '@feasibleone/blong';
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
import type {IBlongError} from '../../types/action.js';
import {ActionButton} from '../ActionButton/index.js';
import type {ITableSelection} from '../Form/FormContext.js';
import {Form} from '../Form/index.js';

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

    /** Action name for saving changed data */
    saveAction?: string;
    /** Called with the saved value on successful save */
    onSave?: (value: Record<string, unknown>) => void;

    /** Static dropdown data keyed by dropdown name — bypasses dispatch */
    dropdowns?: Record<string, {value: unknown; label: string}[]>;

    /** Toolbar buttons (left side) */
    toolbar?: IToolbarButton[];
    /** Toolbar buttons (right side) */
    toolbarRight?: IToolbarButton[];

    /** Start in edit mode */
    editMode?: boolean;
    /** Allow user to toggle edit mode */
    editable?: boolean;
    /** Show design mode toggle cog button on the toolbar right side */
    designable?: boolean;
    /** Start in design mode (requires designable=true) */
    initialDesignMode?: boolean;
    /** Permission check passed to the form; cards with a permission key are only shown if this returns true */
    checkPermission?: (permission: string) => boolean;

    className?: string;
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
    onSave,
    dropdowns,
    toolbar = [],
    toolbarRight = [],
    editMode: initialEditMode = false,
    editable = true,
    designable = false,
    initialDesignMode = false,
    checkPermission,
    className = '',
}: IEditorProps) {
    const formId = useId();
    const [editMode, setEditMode] = useState(initialEditMode);
    const [localValue, setLocalValue] = useState<Record<string, unknown> | undefined>(undefined);
    const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>(undefined);
    const [isDirty, setIsDirty] = useState(false);
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

    const handleTableSelect = useCallback(
        (fieldName: string, selection: ITableSelection | null) => {
            // Skip navigator widget selections — they drive cascade filtering, not toolbar context
            if (!isTableWidget(fieldName)) return;
            setTableSelections(prev => ({...prev, [fieldName]: selection}));
            if (selection) setLastTableFieldName(fieldName);
            else if (lastTableFieldName === fieldName) setLastTableFieldName(null);
        },
        [isTableWidget, lastTableFieldName],
    );

    /** Template context derived from the most recent non-null table widget selection */
    const lastRow = lastTableFieldName ? (tableSelections[lastTableFieldName]?.row ?? null) : null;
    const selectionContext: Record<string, unknown> = {
        id: lastRow?.id,
        current: lastRow,
        selected: lastRow ? [lastRow] : [],
        ...(lastRow ?? {}),
    };

    // Callback passed to DesignAddCardButton: adds the new card name to localLayouts
    const handleCardAdded = useCallback(
        (name: string) => {
            setLocalLayouts(prev => {
                const cur = prev?.[layout];
                const flat: FlatLayoutConfig = Array.isArray(cur)
                    ? [...(cur as FlatLayoutConfig)]
                    : [];
                return {...(prev ?? {}), [layout]: [...flat, name] as FlatLayoutConfig};
            });
        },
        [layout],
    );

    // Load action (skipped when static value is provided)
    const loader = useAction<Record<string, unknown>>(
        staticValue ? '' : (loadAction ?? ''),
        'query',
        loadParams,
    );
    const entityValue = localValue ?? staticValue ?? loader.data ?? undefined;

    // Save action invoked via form submit (formId wired to ActionButton)
    const saver = useAction(saveAction ?? '', 'mutation');

    // Show/hide the validation hint overlay when validationHint changes
    useEffect(() => {
        if (validationHint && saveButtonRef.current) {
            hintOverlayRef.current?.show(null, saveButtonRef.current);
        } else {
            hintOverlayRef.current?.hide();
        }
    }, [validationHint]);

    const handleSubmit = async (formValue: Record<string, unknown>) => {
        setServerErrors(undefined);
        try {
            await saver.call(formValue);
            setLocalValue(formValue);
            setIsDirty(false);
            setSavedSuccess(true);
            setValidationHint(undefined);
            onSave?.(formValue);
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

    // Build default toolbar when none specified
    const leftButtons: IToolbarButton[] = [
        ...(editable && !editMode
            ? [{label: 'Edit', icon: 'pi pi-pencil', action: '__edit__'}]
            : []),
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
        ...toolbar,
    ];

    // Right side: custom buttons + optional design cog
    const rightButtons: IToolbarButton[] = [
        ...toolbarRight,
        ...(designable ? [{label: 'Design', icon: 'pi pi-cog', action: '__design__'}] : []),
    ];

    /** True while any toolbar action or save is in-flight — disables all remaining buttons */
    const globalBusy = toolbarBusy > 0 || saver.loading;

    const handleToolbarAction = (actionName: string) => {
        if (actionName === '__edit__') setEditMode(true);
        if (actionName === '__design__') setDesignMode(d => !d);
        if (actionName === '__cancel__') {
            const doReset = () => {
                setLocalValue(undefined);
                setIsDirty(false);
                setSavedSuccess(false);
                setValidationHint(undefined);
                setEditMode(initialEditMode);
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
                    typeof btn.action === 'string' ? btn.action : (btn.action?.name ?? '');
                const isDisabled =
                    (actionName === '__save__' || actionName === '__cancel__') &&
                    (!isDirty || saver.loading || toolbarBusy > 0);
                if (actionName === '__edit__' || actionName === '__cancel__') {
                    return (
                        <button
                            ref={actionName === '__cancel__' ? cancelButtonRef : undefined}
                            key={i}
                            type="button"
                            className={`p-button p-component p-button-icon-only mr-2${isDisabled ? ' p-disabled' : ''}`}
                            aria-label={btn.label}
                            disabled={isDisabled}
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
                            key={i}
                            type="submit"
                            form={formId}
                            className={`p-button p-component p-button-icon-only mr-2${isDisabled ? ' p-disabled' : ''}`}
                            aria-label={btn.label}
                            disabled={isDisabled}
                        >
                            {btn.icon && (
                                <span
                                    className={`p-button-icon p-c pi ${saver.loading || toolbarBusy > 0 ? 'pi-spin pi-spinner' : btn.icon}`}
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
                        typeof btn.action === 'string' ? btn.action : (btn.action?.name ?? '');
                    if (actionName === '__design__') {
                        return (
                            <span
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
            className={`blong-editor ${className}`}
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
                layout={layout}
                layouts={localLayouts}
                value={entityValue}
                onChange={v => {
                    setLocalValue(v);
                    setIsDirty(true);
                    setSavedSuccess(false);
                    setValidationHint(undefined);
                }}
                onSubmit={saveAction ? handleSubmit : undefined}
                onTableSelect={handleTableSelect}
                readOnly={
                    (!editMode && !initialEditMode) ||
                    saver.loading ||
                    toolbarBusy > 0 ||
                    loader.loading
                }
                loading={loader.loading}
                serverErrors={serverErrors}
                checkPermission={checkPermission}
                dropdowns={dropdowns}
                onLayoutChange={
                    designMode
                        ? (key, newLayout) => {
                              setLocalLayouts(prev => ({
                                  ...(prev ?? {}),
                                  [key]: newLayout as FlatLayoutConfig,
                              }));
                          }
                        : undefined
                }
                rightPanel={designable ? <PropertyEditor /> : undefined}
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
