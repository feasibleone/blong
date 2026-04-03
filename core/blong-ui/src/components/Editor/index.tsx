/**
 * Editor — Form + toolbar + lifecycle wrapper.
 *
 * Wires a Form to load/save actions, renders a configurable toolbar,
 * and manages edit/read-only toggling. Designed to edit a single entity.
 */
import {Toolbar} from 'primereact/toolbar';
import {useId, useState} from 'react';
import {useAction} from '../../hooks/useAction.js';
import type {LayoutConfig} from '../../hooks/useLayout.js';
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

    /** Action name for loading the entity; result populates the form */
    loadAction?: string;
    /** Params for the load action */
    loadParams?: Record<string, unknown>;

    /** Action name for saving changed data */
    saveAction?: string;

    /** Toolbar buttons (left side) */
    toolbar?: IToolbarButton[];
    /** Toolbar buttons (right side) */
    toolbarRight?: IToolbarButton[];

    /** Start in edit mode */
    editMode?: boolean;
    /** Allow user to toggle edit mode */
    editable?: boolean;

    className?: string;
}

export function Editor({
    schema,
    cards,
    layout = 'default',
    layouts,
    loadAction,
    loadParams,
    saveAction,
    toolbar = [],
    toolbarRight = [],
    editMode: initialEditMode = false,
    editable = true,
    className = '',
}: IEditorProps) {
    const formId = useId();
    const [editMode, setEditMode] = useState(initialEditMode);
    const [localValue, setLocalValue] = useState<Record<string, unknown> | undefined>(undefined);
    const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>(undefined);

    // Load action
    const loader = useAction<Record<string, unknown>>(loadAction ?? '', loadParams);
    const entityValue = localValue ?? loader.data ?? undefined;

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
                  {label: 'Cancel', icon: 'pi pi-times', action: '__cancel__'},
              ]
            : []),
        ...toolbar,
    ];

    const handleToolbarAction = (actionName: string) => {
        if (actionName === '__edit__') setEditMode(true);
        if (actionName === '__cancel__') {
            setLocalValue(undefined);
            setEditMode(false);
        }
    };

    const leftContent = (
        <div className="blong-toolbar-left">
            {leftButtons.map((btn, i) => {
                const actionName =
                    typeof btn.action === 'string' ? btn.action : (btn.action?.name ?? '');
                if (actionName === '__edit__' || actionName === '__cancel__') {
                    return (
                        <button
                            key={i}
                            type="button"
                            className={`p-button p-component ${actionName === '__cancel__' ? 'p-button-outlined' : ''}`}
                            onClick={() => handleToolbarAction(actionName)}
                        >
                            {btn.icon && <span className={`p-button-icon pi ${btn.icon}`} />}
                            {btn.label && <span className="p-button-label">{btn.label}</span>}
                        </button>
                    );
                }
                if (actionName === '__save__') {
                    return (
                        <button
                            key={i}
                            type="submit"
                            form={formId}
                            className="p-button p-component"
                        >
                            {btn.icon && <span className={`p-button-icon pi ${btn.icon}`} />}
                            {btn.label && <span className="p-button-label">{btn.label}</span>}
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
        toolbarRight.length > 0 ? (
            <div className="blong-toolbar-right">
                {toolbarRight.map((btn, i) => (
                    <ActionButton
                        key={i}
                        {...btn}
                        formId={formId}
                    />
                ))}
            </div>
        ) : undefined;

    return (
        <div className={`blong-editor ${className}`}>
            {(leftButtons.length > 0 || toolbarRight.length > 0) && (
                <Toolbar
                    start={leftContent}
                    end={rightContent}
                    className="blong-editor-toolbar"
                />
            )}
            <Form
                id={formId}
                schema={schema}
                cards={cards}
                layout={layout}
                layouts={layouts}
                value={entityValue}
                onChange={setLocalValue}
                onSubmit={saveAction ? handleSubmit : undefined}
                readOnly={!editMode && !initialEditMode}
                loading={loader.loading}
                serverErrors={serverErrors}
            />
        </div>
    );
}
