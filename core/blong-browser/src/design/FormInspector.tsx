/**
 * FormInspector — debug panel showing live form state, replacing @hookform/devtools.
 *
 * Renders a side panel (styled like PropertyEditor) with collapsible sections for:
 *   - Fields — per-field dirty/touched/error badges (via useFormState from react-hook-form)
 *   - Values — current form values (via useWatch — live on every keystroke)
 *   - Table selections (from FormStateContext — not tracked by react-hook-form)
 *   - State — read-only / loading flags (from FormStateContext — not tracked by react-hook-form)
 *
 * More sections can be added in future by following the Section pattern below.
 *
 * The component must be rendered inside a <Form> so it can read FormContext and
 * FormStateContext. FormInspector guards against null context and renders nothing
 * when used outside a Form.
 */
import {useState} from 'react';
import type {ReactNode} from 'react';
import type {Control} from 'react-hook-form';
import {useFormState, useWatch} from 'react-hook-form';
import {Json} from '../components/Json/index.js';
import {useBlongForm, useBlongFormState} from '../components/Form/FormContext.js';

// ── Section (collapsible) ────────────────────────────────────────────────────

interface ISectionProps {
    title: string;
    value?: unknown;
    defaultOpen?: boolean;
    children?: ReactNode;
}

function Section({title, value, defaultOpen = false, children}: ISectionProps) {
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
                    {children ?? <Json value={value} />}
                </div>
            )}
        </div>
    );
}

// ── Fields section ───────────────────────────────────────────────────────────

/**
 * Renders one row per field showing dirty / touched / error status.
 * Uses useFormState (subscribes to dirty/touched/errors) and useWatch (subscribes
 * to values) separately so each only triggers when its own slice changes.
 */
function FieldsSection({control}: {control: Control<Record<string, unknown>>}) {
    const {dirtyFields, touchedFields, errors} = useFormState({control});

    const allFields = new Set([
        ...Object.keys(dirtyFields),
        ...Object.keys(touchedFields),
        ...Object.keys(errors),
    ]);

    if (allFields.size === 0) {
        return (
            <p className="blong-inspector__empty">No dirty / touched / error fields yet.</p>
        );
    }

    return (
        <dl className="blong-inspector__fields">
            {[...allFields].map(field => {
                const dirty = !!dirtyFields[field];
                const touched = !!touchedFields[field];
                const error = errors[field];
                return (
                    <div
                        key={field}
                        className="blong-inspector__field-row"
                    >
                        <dt className={`blong-inspector__field-name${dirty ? ' blong-inspector__field-name--dirty' : ''}`}>
                            {field}
                        </dt>
                        <dd className="blong-inspector__field-flags">
                            {dirty && <span className="blong-inspector__badge blong-inspector__badge--dirty">D</span>}
                            {touched && <span className="blong-inspector__badge blong-inspector__badge--touched">T</span>}
                            {error && (
                                <span
                                    className="blong-inspector__badge blong-inspector__badge--error"
                                    title={error.message as string | undefined}
                                >
                                    {error.type ?? 'E'}
                                </span>
                            )}
                            {error?.message && (
                                <span className="blong-inspector__error-msg">
                                    {error.message as string}
                                </span>
                            )}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

// ── Main inspector ───────────────────────────────────────────────────────────

interface IFormInspectorInnerProps {
    control: Control<Record<string, unknown>>;
}

function FormInspectorInner({control}: IFormInspectorInnerProps) {
    const stateCtx = useBlongFormState();
    // Subscribe to all field value changes so the Values section stays live.
    const values = useWatch({control});

    return (
        <div className="blong-property-editor blong-inspector">
            <div className="blong-property-editor__title">
                <i className="pi pi-info-circle blong-inspector__icon" />
                Form Inspector
            </div>
            <Section
                title="Fields"
                defaultOpen
            >
                <FieldsSection control={control} />
            </Section>
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
