/**
 * PropertyEditor — sidebar panel showing editable properties of the selected element.
 *
 * Card properties: label, collapsible, hidden, className.
 * Field properties: title, widget.type, required, readOnly (all editable).
 */
import type {ICardConfig, IEnrichedFieldSchema} from '@feasibleone/blong';
import {useState} from 'react';
import {useBlongForm} from '../components/Form/FormContext.js';
import {useDesignMode} from './useDesignMode.js';

const WIDGET_TYPES = [
    'input',
    'text',
    'textArea',
    'password',
    'number',
    'integer',
    'boolean',
    'checkbox',
    'switch',
    'date',
    'time',
    'dateTime',
    'dropdown',
    'multiSelect',
    'select',
    'selectTable',
    'chips',
    'file',
    'image',
    'table',
    'json',
    'code',
    'label',
    'link',
    'divider',
] as const;

const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

export function PropertyEditor() {
    const {active, selected, config, updateConfig} = useDesignMode();
    const formCtx = useBlongForm();

    if (!active) return null;

    if (!selected) {
        return (
            <div className="blong-property-editor blong-property-editor--empty">
                <i className="pi pi-info-circle blong-property-editor__icon" />
                <p className="blong-property-editor__hint">Click a card or field to inspect it</p>
            </div>
        );
    }

    if (selected.type === 'card') {
        // selected.id = 'card-{cardName}'
        const cardName = selected.id.replace(/^card-/, '');
        const origCard = formCtx?.cards[cardName];
        const cardOverride = config.cards[cardName] ?? {};
        const cardConfig = {...(origCard?.config ?? {}), ...cardOverride};

        const update = (patch: Record<string, unknown>) =>
            updateConfig({
                cards: {
                    ...config.cards,
                    [cardName]: {...cardOverride, ...patch},
                },
            });

        return (
            <div className="blong-property-editor">
                <div className="blong-property-editor__title">Card</div>
                <div className="blong-property-editor__field">
                    <label htmlFor="pe-card-label">Label</label>
                    <input
                        id="pe-card-label"
                        type="text"
                        className="blong-property-editor__input"
                        value={cardConfig.label ?? origCard?.label ?? ''}
                        onChange={e => update({label: e.target.value})}
                    />
                </div>
                <div className="blong-property-editor__field">
                    <label htmlFor="pe-card-class">CSS class</label>
                    <input
                        id="pe-card-class"
                        type="text"
                        className="blong-property-editor__input"
                        value={cardConfig.className ?? ''}
                        onChange={e => update({className: e.target.value || undefined})}
                    />
                </div>
                <div className="blong-property-editor__check">
                    <input
                        id="pe-card-collapsible"
                        type="checkbox"
                        checked={cardConfig.collapsible ?? false}
                        onChange={e => update({collapsible: e.target.checked || undefined})}
                    />
                    <label htmlFor="pe-card-collapsible">Collapsible</label>
                </div>
                <div className="blong-property-editor__check">
                    <input
                        id="pe-card-hidden"
                        type="checkbox"
                        checked={cardConfig.hidden ?? false}
                        onChange={e => update({hidden: e.target.checked || undefined})}
                    />
                    <label htmlFor="pe-card-hidden">Hidden</label>
                </div>
            </div>
        );
    }

    if (selected.type === 'field') {
        // selected.id = 'field:{fieldName}:{cardName}'
        const colonIdx = selected.id.indexOf(':', 6); // skip 'field:'
        const fieldName = selected.id.substring(6, colonIdx);
        const cardName = selected.id.substring(colonIdx + 1);

        const baseSchema = formCtx?.schema?.properties?.[fieldName];
        const schemaOverride = (config.schema?.[fieldName] ?? {}) as {
            title?: string;
            type?: string;
            required?: boolean;
            readOnly?: boolean;
            widget?: {type?: string};
        };
        const card = formCtx?.cards[cardName];

        const updateField = (patch: Record<string, unknown>) =>
            updateConfig({
                schema: {
                    ...(config.schema ?? {}),
                    [fieldName]: {...schemaOverride, ...patch} as Partial<IEnrichedFieldSchema>,
                },
            });

        const currentTitle = schemaOverride.title ?? baseSchema?.title ?? fieldName;
        const currentType = schemaOverride.type ?? baseSchema?.type ?? '';
        const currentWidgetType =
            schemaOverride.widget?.type ?? baseSchema?.widget?.type ?? 'input';
        const currentRequired = schemaOverride.required ?? baseSchema?.required ?? false;
        const currentReadOnly = schemaOverride.readOnly ?? baseSchema?.readOnly ?? false;

        return (
            <div className="blong-property-editor p-component">
                <div className="blong-property-editor__title">Field · {fieldName}</div>
                <div className="blong-property-editor__row">
                    <span className="blong-property-editor__key">Card</span>
                    <span className="blong-property-editor__val">{card?.label ?? cardName}</span>
                </div>
                <div className="blong-property-editor__field">
                    <label htmlFor="pe-field-title">Label</label>
                    <input
                        id="pe-field-title"
                        type="text"
                        className="blong-property-editor__input"
                        value={currentTitle}
                        onChange={e => updateField({title: e.target.value || undefined})}
                    />
                </div>
                <div className="blong-property-editor__field">
                    <label htmlFor="pe-field-type">Type</label>
                    <select
                        id="pe-field-type"
                        className="blong-property-editor__input"
                        value={currentType}
                        onChange={e => updateField({type: e.target.value || undefined})}
                    >
                        <option value="">—</option>
                        {FIELD_TYPES.map(t => (
                            <option
                                key={t}
                                value={t}
                            >
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="blong-property-editor__field">
                    <label htmlFor="pe-field-widget">Widget</label>
                    <select
                        id="pe-field-widget"
                        className="blong-property-editor__input"
                        value={currentWidgetType}
                        onChange={e =>
                            updateField({
                                widget: {...(schemaOverride.widget ?? {}), type: e.target.value},
                            })
                        }
                    >
                        {WIDGET_TYPES.map(t => (
                            <option
                                key={t}
                                value={t}
                            >
                                {t}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="blong-property-editor__check">
                    <input
                        id="pe-field-required"
                        type="checkbox"
                        checked={currentRequired}
                        onChange={e => updateField({required: e.target.checked || undefined})}
                    />
                    <label htmlFor="pe-field-required">Required</label>
                </div>
                <div className="blong-property-editor__check">
                    <input
                        id="pe-field-readonly"
                        type="checkbox"
                        checked={currentReadOnly}
                        onChange={e => updateField({readOnly: e.target.checked || undefined})}
                    />
                    <label htmlFor="pe-field-readonly">Read-only</label>
                </div>
            </div>
        );
    }

    return (
        <div className="blong-property-editor">
            <div className="blong-property-editor__title">{selected.type}</div>
            <p className="blong-property-editor__hint">{selected.id}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// DesignAddCardButton / DesignAddFieldButton — rendered inside DesignModeProvider
// so they can call useDesignMode(). Used by Editor toolbar.
// ---------------------------------------------------------------------------

export function DesignAddCardButton({onCardAdded}: {onCardAdded: (name: string) => void}) {
    const {updateConfig, config} = useDesignMode();

    const handleAdd = () => {
        const name = `card_${Date.now()}`;
        updateConfig({
            cards: {
                ...config.cards,
                [name]: {label: 'New Card', widgets: []} as ICardConfig,
            },
        });
        onCardAdded(name);
    };

    return (
        <button
            type="button"
            className="p-button p-component p-button-icon-only ml-1"
            aria-label="Add card"
            title="Add card"
            onClick={handleAdd}
        >
            <span className="p-button-icon p-c pi pi-id-card" />
            <span className="p-button-label p-c">&nbsp;</span>
        </button>
    );
}

export function DesignAddFieldButton({
    schema: schemaProp,
    // cards: cardsProp,
}: {
    schema?: Record<string, unknown>;
    cards?: Record<string, unknown>;
}) {
    const {updateConfig, config, selected} = useDesignMode();
    const formCtx = useBlongForm();
    const [open, setOpen] = useState(false);

    // All schema field names
    const allFields = Object.keys(
        (formCtx?.schema?.properties ?? schemaProp ?? {}) as Record<string, unknown>,
    );

    // Fields currently used in any card (base + design overrides)
    const usedFields = new Set<string>([
        ...Object.values(formCtx?.cards ?? {}).flatMap(c => c.fields),
        ...Object.values(config.cards).flatMap(c => {
            const w = c.widgets ?? (Array.isArray(c.fields) ? c.fields : []);
            return w as string[];
        }),
    ]);

    const availableFields = allFields.filter(f => !usedFields.has(f));

    const handleAddField = (fieldName: string) => {
        // Target card: currently selected card, or the first one
        const cardName =
            selected?.type === 'card'
                ? selected.id.replace(/^card-/, '')
                : (Object.keys(formCtx?.cards ?? {})[0] ?? Object.keys(config.cards)[0]);
        if (!cardName) return;

        const baseCard = formCtx?.cards[cardName];
        const designCard = config.cards[cardName];
        const existing: string[] =
            (designCard?.widgets as string[] | undefined) ?? baseCard?.fields ?? [];

        updateConfig({
            cards: {
                ...config.cards,
                [cardName]: {
                    ...(designCard ?? {}),
                    widgets: [...existing, fieldName],
                    fields: undefined,
                } as ICardConfig,
            },
        });
        setOpen(false);
    };

    if (!open && availableFields.length === 0) return null;

    return (
        <span style={{position: 'relative', display: 'inline-block'}}>
            <button
                type="button"
                className="p-button p-component p-button-icon-only ml-1"
                aria-label="Add field"
                title="Add field"
                disabled={availableFields.length === 0}
                onClick={() => setOpen(o => !o)}
            >
                <span className="p-button-icon p-c pi pi-plus-circle" />
                <span className="p-button-label p-c">&nbsp;</span>
            </button>
            {open && (
                <div className="blong-design-field-picker">
                    {availableFields.map(f => (
                        <div
                            key={f}
                            className="blong-design-field-picker__item"
                            onClick={() => handleAddField(f)}
                        >
                            {formCtx?.schema?.properties?.[f]?.title ?? f}
                        </div>
                    ))}
                </div>
            )}
        </span>
    );
}
