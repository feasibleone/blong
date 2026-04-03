/**
 * Editor — Form + toolbar + lifecycle wrapper.
 *
 * Wires a Form to load/save actions, renders a configurable toolbar,
 * and manages edit/read-only toggling. Designed to edit a single entity.
 */
import {Toolbar} from 'primereact/toolbar';
import {useId, useState} from 'react';
import {useAction} from '../../hooks/useAction.js';
import {type FlatLayoutConfig, type LayoutConfig} from '../../hooks/useLayout.js';
import type {IToolbarButton} from '../../types/action.js';
import type {ICardConfig, IEnrichedSchema} from '../../types/widget.js';
import {ActionButton} from '../ActionButton/index.js';
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
    /** Permission check passed to the form; cards with a permission key are only shown if this returns true */
    checkPermission?: (permission: string) => boolean;

    className?: string;
}

const backgroundNone = {background: 'none'};

export function Editor({
    schema,
    cards,
    layout = 'default',
    layouts,
    value: staticValue,
    loadAction,
    loadParams,
    saveAction,
    dropdowns,
    toolbar = [],
    toolbarRight = [],
    editMode: initialEditMode = false,
    editable = true,
    designable = false,
    checkPermission,
    className = '',
}: IEditorProps) {
    const formId = useId();
    const [editMode, setEditMode] = useState(initialEditMode);
    const [localValue, setLocalValue] = useState<Record<string, unknown> | undefined>(undefined);
    const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>(undefined);
    const [isDirty, setIsDirty] = useState(false);
    const [designMode, setDesignMode] = useState(false);
    // Mutable copy of layouts — updated when the user reorders cards in design mode
    const [localLayouts, setLocalLayouts] = useState<Record<string, LayoutConfig> | undefined>(
        () => layouts,
    );

    // Load action (skipped when static value is provided)
    const loader = useAction<Record<string, unknown>>(
        staticValue ? '' : (loadAction ?? ''),
        loadParams,
    );
    const entityValue = localValue ?? staticValue ?? loader.data ?? undefined;

    // Save action invoked via form submit (formId wired to ActionButton)
    const saver = useAction(saveAction ?? '');

    const handleSubmit = async (formValue: Record<string, unknown>) => {
        setServerErrors(undefined);
        try {
            await saver.call(formValue);
            setLocalValue(formValue);
            setEditMode(false);
        } catch (err: unknown) {
            const blongErr = err as {validation?: Record<string, string>};
            if (blongErr?.validation) setServerErrors(blongErr.validation);
        }
    };

    // Build default toolbar when none specified
    const leftButtons: IToolbarButton[] = [
        ...(editable && !editMode
            ? [{label: 'Edit', icon: 'pi pi-pencil', action: '__edit__'}]
            : []),
        ...(editMode
            ? [
                  {label: 'Save', icon: 'pi pi-save', submit: true, action: '__save__'},
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

    const handleToolbarAction = (actionName: string) => {
        if (actionName === '__edit__') setEditMode(true);
        if (actionName === '__design__') setDesignMode(d => !d);
        if (actionName === '__cancel__') {
            setLocalValue(undefined);
            setIsDirty(false);
            setEditMode(false);
        }
    };

    const leftContent = (
        <div className="blong-toolbar-left">
            {leftButtons.map((btn, i) => {
                const actionName =
                    typeof btn.action === 'string' ? btn.action : (btn.action?.name ?? '');
                const isDisabled =
                    (actionName === '__save__' || actionName === '__cancel__') && !isDirty;
                if (actionName === '__edit__' || actionName === '__cancel__') {
                    return (
                        <button
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
                            key={i}
                            type="submit"
                            form={formId}
                            className={`p-button p-component p-button-icon-only mr-2${isDisabled ? ' p-disabled' : ''}`}
                            aria-label={btn.label}
                            disabled={isDisabled}
                        >
                            {btn.icon && <span className={`p-button-icon p-c pi ${btn.icon}`} />}
                            <span className="p-button-label p-c">&nbsp;</span>
                        </button>
                    );
                }
                return (
                    <ActionButton
                        key={i}
                        {...btn}
                        formId={formId}
                    />
                );
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
                            <button
                                key={i}
                                type="button"
                                className="p-button p-component p-button-icon-only"
                                aria-label={btn.label}
                                onClick={() => handleToolbarAction(actionName)}
                            >
                                {btn.icon && (
                                    <span className={`p-button-icon p-c pi ${btn.icon}`} />
                                )}
                                <span className="p-button-label p-c">&nbsp;</span>
                            </button>
                        );
                    }
                    return (
                        <ActionButton
                            key={i}
                            {...btn}
                            formId={formId}
                        />
                    );
                })}
            </div>
        ) : undefined;

    return (
        <div
            className={`blong-editor ${className}`}
            data-testid="blong-ui-test"
        >
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
                }}
                onSubmit={saveAction ? handleSubmit : undefined}
                readOnly={!editMode && !initialEditMode}
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
            />
        </div>
    );
}
