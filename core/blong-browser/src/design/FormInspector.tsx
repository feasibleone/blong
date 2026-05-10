/**
 * FormInspector — debug panel showing live form state not tracked by react-hook-form.
 *
 * Renders a side panel (styled like PropertyEditor) with collapsible sections for:
 *   - Current form values (via useWatch — live on every keystroke)
 *   - Table selections (from FormStateContext)
 *   - Read-only / loading flags (from FormStateContext)
 *
 * More sections can be added in future by following the Section pattern below.
 *
 * The component must be rendered inside a <Form> so it can read FormContext and
 * FormStateContext. FormInspector guards against null context and renders nothing
 * when used outside a Form.
 */
import {useState} from 'react';
import type {Control} from 'react-hook-form';
import {useWatch} from 'react-hook-form';
import {Json} from '../components/Json/index.js';
import {useBlongForm, useBlongFormState} from '../components/Form/FormContext.js';

interface ISectionProps {
    title: string;
    value: unknown;
    defaultOpen?: boolean;
}

function Section({title, value, defaultOpen = false}: ISectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="blong-inspector__section">
            <button
                type="button"
                className="blong-inspector__toggle"
                onClick={() => setOpen(o => !o)}
            >
                <span className={`pi pi-chevron-${open ? 'down' : 'right'} blong-inspector__chevron`} />
                {title}
            </button>
            {open && (
                <div className="blong-inspector__body">
                    <Json value={value} />
                </div>
            )}
        </div>
    );
}

interface IFormInspectorInnerProps {
    control: Control<Record<string, unknown>>;
}

function FormInspectorInner({control}: IFormInspectorInnerProps) {
    const stateCtx = useBlongFormState();
    // Subscribe to all field changes so the inspector stays in sync while the user types.
    const values = useWatch({control});

    return (
        <div className="blong-property-editor blong-inspector">
            <div className="blong-property-editor__title">
                <i className="pi pi-info-circle blong-inspector__icon" />
                Form Inspector
            </div>
            <Section
                title="Values"
                value={values}
                defaultOpen
            />
            <Section
                title="Table Selections"
                value={stateCtx?.tableSelections ?? {}}
            />
            <Section
                title="State"
                value={{
                    readOnly: stateCtx?.readOnly,
                    loading: stateCtx?.loading,
                }}
            />
        </div>
    );
}

/**
 * FormInspector — render inside a <Form> to display live form state in debug mode.
 * Returns null when rendered outside a Form context (guards against both FormContext
 * and FormStateContext being unavailable).
 */
export function FormInspector() {
    const formCtx = useBlongForm();
    if (!formCtx) return null;
    return <FormInspectorInner control={formCtx.control} />;
}
