/**
 * Form — schema-driven form component.
 *
 * Renders a hierarchy of Deck → Card → widget for every field in the schema.
 * Driven by react-hook-form internally; publishes flattened values via onChange/onSubmit.
 */
import {Message} from 'primereact/message';
import {useEffect, useId} from 'react';
import {Controller, useForm, type SubmitHandler} from 'react-hook-form';
import {useLayout, type LayoutConfig} from '../../hooks/useLayout.js';
import {buildValidationRules} from '../../schema/validate.js';
import type {ICardConfig, IEnrichedSchema} from '../../types/widget.js';
import {widgetRegistry} from '../../widgets/index.js';
import {Card} from '../Card/index.js';
import {Deck} from '../Deck/index.js';

export interface IFormProps {
    /** JSON-enriched schema describing fields */
    schema?: IEnrichedSchema;
    /** Card group definitions — each card lists visible fields */
    cards?: Record<string, ICardConfig>;
    /** Active layout key */
    layout?: string;
    /** Layout configuration map — layout key → list of deck rows */
    layouts?: Record<string, LayoutConfig>;
    /** Current form value */
    value?: Record<string, unknown>;
    /** Fired on every valid field change */
    onChange?: (value: Record<string, unknown>) => void;
    /** Fired when the form is submitted (after validation) */
    onSubmit?: (value: Record<string, unknown>) => void | Promise<void>;
    /** Render fields read-only (no inputs) */
    readOnly?: boolean;
    /** Show loading skeleton */
    loading?: boolean;
    /** External validation errors keyed by field name */
    serverErrors?: Record<string, string>;
    /** Form id for external submit buttons */
    id?: string;
}

export function Form({
    schema,
    cards: cardsConfig,
    layout = 'default',
    layouts,
    value,
    onChange,
    onSubmit,
    readOnly = false,
    loading = false,
    serverErrors,
    id,
}: IFormProps) {
    const fallbackId = useId();
    const formId = id ?? fallbackId;

    const {rows, cards} = useLayout(schema, cardsConfig, layout, layouts);

    const {
        control,
        handleSubmit,
        reset,
        setError,
        formState: {errors},
    } = useForm<Record<string, unknown>>({
        defaultValues: value ?? {},
        mode: 'onBlur',
    });

    // Sync external value changes (e.g. after fetch)
    useEffect(() => {
        if (value !== undefined) reset(value);
    }, [value, reset]);

    // Push server-side validation errors into react-hook-form
    useEffect(() => {
        if (!serverErrors) return;
        for (const [field, message] of Object.entries(serverErrors)) {
            setError(field, {type: 'server', message});
        }
    }, [serverErrors, setError]);

    const handleFormSubmit: SubmitHandler<Record<string, unknown>> = async data => {
        await onSubmit?.(data);
    };

    return (
        <form
            id={formId}
            onSubmit={onSubmit ? handleSubmit(handleFormSubmit) : undefined}
            className="blong-form"
            noValidate
        >
            {rows.map((deckCards, rowIndex) => (
                <Deck key={rowIndex}>
                    {deckCards.map(cardName => {
                        const resolved = cards[cardName];
                        if (!resolved) return null;
                        const cardReadOnly = readOnly || resolved.config.readOnly;
                        return (
                            <Card
                                key={cardName}
                                title={resolved.label}
                                collapsible={resolved.config.collapsible}
                                loading={loading || resolved.config.loading}
                            >
                                <div className="blong-form-fields">
                                    {resolved.fields.map(fieldName => {
                                        const fieldSchema = schema?.properties?.[fieldName];
                                        if (!fieldSchema) return null;
                                        const widgetType = fieldSchema.widget?.type ?? 'input';
                                        const WidgetComponent = widgetRegistry.get(widgetType);
                                        if (!WidgetComponent) return null;

                                        const fieldReadOnly = cardReadOnly || fieldSchema.readOnly;

                                        return (
                                            <div
                                                key={fieldName}
                                                className="blong-field"
                                            >
                                                <label
                                                    htmlFor={fieldName}
                                                    className="blong-field-label"
                                                >
                                                    {fieldSchema.title ?? fieldName}
                                                    {fieldSchema.required && (
                                                        <span className="blong-required"> *</span>
                                                    )}
                                                </label>
                                                <Controller
                                                    name={fieldName}
                                                    control={control}
                                                    rules={buildValidationRules(fieldSchema)}
                                                    render={({field, fieldState}) => (
                                                        <WidgetComponent
                                                            name={fieldName}
                                                            schema={fieldSchema}
                                                            value={field.value}
                                                            onChange={val => {
                                                                field.onChange(val);
                                                                onChange?.({
                                                                    ...value,
                                                                    [fieldName]: val,
                                                                });
                                                            }}
                                                            onBlur={field.onBlur}
                                                            error={fieldState.error}
                                                            readOnly={fieldReadOnly}
                                                            loading={loading}
                                                            disabled={loading}
                                                        />
                                                    )}
                                                />
                                                {errors[fieldName] && (
                                                    <Message
                                                        severity="error"
                                                        text={
                                                            errors[fieldName]?.message ??
                                                            'Invalid value'
                                                        }
                                                        className="blong-field-error"
                                                    />
                                                )}
                                                {fieldSchema.description && (
                                                    <small className="blong-field-hint">
                                                        {fieldSchema.description}
                                                    </small>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        );
                    })}
                </Deck>
            ))}
        </form>
    );
}
