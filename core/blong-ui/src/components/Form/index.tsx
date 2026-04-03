/**
 * Form — schema-driven form component.
 *
 * Renders a hierarchy of Deck → Card → widget for every field in the schema.
 * Supports flat layout, tab layout, and steps layout.
 * Driven by react-hook-form internally; publishes flattened values via onChange/onSubmit.
 */
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {SortableContext, rectSortingStrategy} from '@dnd-kit/sortable';
import {Message} from 'primereact/message';
import {PanelMenu} from 'primereact/panelmenu';
import {Steps} from 'primereact/steps';
import {TabMenu} from 'primereact/tabmenu';
import React, {useEffect, useId, useState} from 'react';
import {Controller, useForm, type SubmitHandler} from 'react-hook-form';
import {
    useLayout,
    type FlatLayoutConfig,
    type IResolvedCard,
    type LayoutConfig,
} from '../../hooks/useLayout.js';
import {buildValidationRules} from '../../schema/validate.js';
import type {ICardConfig, IEnrichedFieldSchema, IEnrichedSchema} from '../../types/widget.js';
import {widgetRegistry} from '../../widgets/index.js';
import {Card} from '../Card/index.js';

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
    /**
     * Permission check callback. When provided, cards with a `permission` key are only
     * rendered if this function returns true. Cards without a permission key always render.
     * When omitted, all cards with a permission key are hidden (safe default).
     */
    checkPermission?: (permission: string) => boolean;
    /**
     * Static dropdown data. When provided, widgets whose `schema.widget.dropdown` key matches
     * an entry here will use the static options without dispatching portal.dropdown.list.
     */
    dropdowns?: Record<string, {value: unknown; label: string}[]>;
    /**
     * Called in design mode when the user drags a card to a new position.
     * Receives the layout key and the updated FlatLayoutConfig so the caller can persist the change.
     */
    onLayoutChange?: (layoutKey: string, newLayout: FlatLayoutConfig) => void;
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
    checkPermission,
    dropdowns,
    onLayoutChange,
}: IFormProps) {
    const fallbackId = useId();
    const formId = id ?? fallbackId;

    const layoutResult = useLayout(schema, cardsConfig, layout, layouts);
    const {rows, cards, tabs, layoutType} = layoutResult;

    const [activeTabIndex, setActiveTabIndex] = useState(0);

    // Pointer sensor for design-mode drag-drop
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 5}}));

    const {
        control,
        handleSubmit,
        reset,
        setError,
        watch,
        formState: {errors},
    } = useForm<Record<string, unknown>>({
        defaultValues: value ?? {},
        mode: 'onBlur',
    });

    const formValues = watch();

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

    /** Render all cards in a tab's cardNames list */
    const renderTabCards = (cardNames: string[]) =>
        cardNames.flatMap((rowSpec, i) => {
            const cardName = typeof rowSpec === 'string' ? rowSpec : rowSpec;
            const resolved = cards[cardName];
            if (!resolved) return [];
            return [renderCard(cardName, resolved, i)];
        });

    /** Render a single card.
     * @param isLastInGroup - when false, adds mb-3 spacing */
    const renderCard = (
        cardName: string,
        resolved: IResolvedCard,
        key: React.Key,
        isLastInGroup = true,
    ) => {
        const cardReadOnly = readOnly || resolved.config.readOnly;
        return (
            <Card
                key={key}
                id={`card-${cardName}`}
                title={resolved.label}
                collapsible={resolved.config.collapsible}
                loading={loading || resolved.config.loading}
                className={`w-full${isLastInGroup ? '' : ' mb-3'}`}
            >
                {resolved.fields.map((fieldName, idx) =>
                    renderField(fieldName, cardReadOnly, idx === resolved.fields.length - 1),
                )}
            </Card>
        );
    };

    /** Render a single form field.
     *
     * When `schema.title === ''` (empty string) the label is suppressed and the
     * input wrapper expands to fill the full row width
     *
     * @param isLast - adds `mb-0` to the outer div for the last field in a card
     */
    const renderField = (fieldName: string, cardReadOnly: boolean | undefined, isLast = false) => {
        const rawSchema: IEnrichedFieldSchema | undefined = schema?.properties?.[fieldName];
        // Enrich schema with static dropdown options when provided by parent
        const dropdownKey = rawSchema?.widget?.dropdown;
        const fieldSchema: IEnrichedFieldSchema | undefined =
            dropdowns && dropdownKey && dropdowns[dropdownKey] && rawSchema
                ? {
                      ...rawSchema,
                      widget: {
                          ...rawSchema.widget!,
                          options: dropdowns[dropdownKey],
                          dropdown: undefined,
                      },
                  }
                : rawSchema;
        if (!fieldSchema) return null;
        const widgetType = fieldSchema.widget?.type ?? 'input';
        const WidgetComponent = widgetRegistry.get(widgetType);
        if (!WidgetComponent) return null;
        const fieldReadOnly = cardReadOnly || fieldSchema.readOnly;

        // title === '' (empty string) means: no label, input fills the full row
        const hasLabel = fieldSchema.title !== '';

        return (
            <div
                key={fieldName}
                className={`field grid${isLast ? ' mb-0' : ''}`}
            >
                {hasLabel && (
                    <label
                        htmlFor={fieldName}
                        className="col-12 md:col-4"
                    >
                        {fieldSchema.title ?? fieldName}
                        {fieldSchema.required && <span className="blong-required"> *</span>}
                    </label>
                )}
                <div
                    className={`flex align-items-center relative col-12${hasLabel ? ' md:col-8' : ''}`}
                >
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
                                    onChange?.({...value, [fieldName]: val});
                                }}
                                onBlur={field.onBlur}
                                error={fieldState.error}
                                readOnly={fieldReadOnly}
                                loading={loading}
                                disabled={loading}
                                formValues={formValues}
                            />
                        )}
                    />
                    {errors[fieldName] && (
                        <Message
                            severity="error"
                            text={errors[fieldName]?.message ?? 'Invalid value'}
                            className="blong-field-error"
                        />
                    )}
                    {fieldSchema.description && (
                        <small className="blong-field-hint">{fieldSchema.description}</small>
                    )}
                </div>
            </div>
        );
    };

    const formBody = (() => {
        if (layoutType === 'tabs') {
            const orientation = layoutResult.orientation ?? 'top';
            const activeTab = (tabs ?? [])[activeTabIndex];
            const tabContent = activeTab?.component
                ? React.createElement(activeTab.component)
                : activeTab
                  ? renderTabCards(activeTab.cardNames)
                  : null;

            // Left/right orientation: use PanelMenu (vertical accordion nav, no role="tablist")
            if (orientation === 'left' || orientation === 'right') {
                const panelItems = (tabs ?? []).map((tab, i) => ({
                    id: tab.id,
                    label: tab.label,
                    icon: tab.icon,
                    className: i === activeTabIndex ? 'p-highlight' : '',
                    command: () => setActiveTabIndex(i),
                }));
                return (
                    <div
                        className={`blong-form-panel-layout blong-form-panel-layout--${orientation}`}
                        style={{
                            display: 'flex',
                            flexDirection: orientation === 'left' ? 'row' : 'row-reverse',
                        }}
                    >
                        <PanelMenu
                            model={panelItems}
                            className="blong-form-panelmenu flex-1"
                        />
                        <div className="blong-form-panel-content">{tabContent}</div>
                    </div>
                );
            }

            // Top/bottom orientation: use TabMenu
            const tabItems = (tabs ?? []).map(tab => ({
                label: tab.label,
                icon: tab.icon,
            }));
            return (
                <div className="blong-form-tabs">
                    <TabMenu
                        model={tabItems}
                        activeIndex={activeTabIndex}
                        onTabChange={e => setActiveTabIndex(e.index)}
                        className="blong-form-tabmenu"
                    />
                    <div className="blong-form-tab-content">{tabContent}</div>
                </div>
            );
        }

        if (layoutType === 'steps') {
            const stepItems = (tabs ?? []).map(tab => ({
                label: tab.label,
                icon: tab.icon,
            }));
            const activeStep = tabs?.[activeTabIndex];
            const stepContent = activeStep?.component
                ? React.createElement(activeStep.component)
                : activeStep
                  ? renderTabCards(activeStep.cardNames)
                  : null;
            return (
                <div className="blong-form-steps">
                    <Steps
                        model={stepItems}
                        activeIndex={activeTabIndex}
                        onSelect={e => setActiveTabIndex(e.index)}
                        className="blong-steps-indicator"
                    />
                    <div className="blong-steps-content">{stepContent}</div>
                    <div className="blong-steps-nav">
                        {activeTabIndex > 0 && (
                            <button
                                type="button"
                                className="p-button p-component p-button-outlined"
                                onClick={() => setActiveTabIndex(i => i - 1)}
                            >
                                <span className="p-button-label">Back</span>
                            </button>
                        )}
                        {activeTabIndex < (tabs ?? []).length - 1 && (
                            <button
                                type="button"
                                className="p-button p-component"
                                onClick={() => setActiveTabIndex(i => i + 1)}
                            >
                                <span className="p-button-label">Next</span>
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        // Flat layout — single PrimeFlex grid.
        // Each element of `rows` is a COLUMN GROUP (may contain multiple cards stacked vertically).
        // treats ['one','two'] as one column with two cards.
        // Hidden cards render only hidden inputs (no visual chrome).
        // Cards with a permission key are skipped unless checkPermission passes.

        // Build id list for SortableContext (design mode DnD — requires DndContext parent)
        const allVisibleCardIds = rows.flatMap(col =>
            col.filter(name => !cards[name]?.config.hidden).map(name => `card-${name}`),
        );

        /**
         * handleDragEnd — mutate the flat layout when a card is dropped onto another.
         * Finds active.id (dragged) and over.id (drop target), removes the dragged card
         * from its source column, and inserts it at the target position. Empty columns
         * are pruned. Calls onLayoutChange with the updated FlatLayoutConfig.
         */
        const handleDragEnd = (event: DragEndEvent) => {
            const {active, over} = event;
            if (!over || active.id === over.id) return;
            const activeCardName = String(active.id).replace(/^card-/, '');
            const overCardName = String(over.id).replace(/^card-/, '');

            const findCard = (name: string) => {
                for (let ci = 0; ci < rows.length; ci++) {
                    const idx = rows[ci].indexOf(name);
                    if (idx !== -1) return {ci, idx};
                }
                return null;
            };

            const from = findCard(activeCardName);
            const to = findCard(overCardName);
            if (!from || !to) return;

            const newRows = rows.map(col => [...col]);
            newRows[from.ci].splice(from.idx, 1);
            // Adjust insert index when moving downward within the same column
            const insertIdx = from.ci === to.ci && to.idx > from.idx ? to.idx - 1 : to.idx;
            newRows[to.ci].splice(insertIdx, 0, activeCardName);

            const filteredRows = newRows.filter(col => col.length > 0);
            const newLayoutConfig: FlatLayoutConfig = filteredRows.map(group =>
                group.length === 1 ? group[0] : group,
            );
            onLayoutChange?.(layout, newLayoutConfig);
        };

        const gridContent = (
            <div className="grid col align-self-start max-w-screen">
                {rows.map((columnCards, colIdx) => {
                    const hiddenCards = columnCards.filter(name => cards[name]?.config.hidden);
                    const visibleCards = columnCards.filter(name => {
                        const resolved = cards[name];
                        if (!resolved || resolved.config.hidden) return false;
                        if (resolved.config.permission !== undefined) {
                            return !!checkPermission?.(resolved.config.permission);
                        }
                        return true;
                    });

                    const hiddenInputs = hiddenCards.flatMap(cardName => {
                        const resolved = cards[cardName];
                        if (!resolved) return [];
                        return resolved.fields.map(fieldName => {
                            const fieldSchema = schema?.properties?.[fieldName];
                            if (!fieldSchema) return null;
                            return (
                                <Controller
                                    key={fieldName}
                                    name={fieldName}
                                    control={control}
                                    render={({field}) => (
                                        <input
                                            type="hidden"
                                            name={fieldName}
                                            value={field.value != null ? String(field.value) : ''}
                                        />
                                    )}
                                />
                            );
                        });
                    });

                    if (!visibleCards.length && !hiddenInputs.length) return null;

                    const firstVisible =
                        visibleCards.length > 0 ? cards[visibleCards[0]] : undefined;
                    const colClass = firstVisible?.config.className ?? 'col-12 xl:col-6';

                    return (
                        <React.Fragment key={colIdx}>
                            {hiddenInputs.length > 0 && (
                                <div
                                    key="hidden"
                                    className="col-12"
                                    style={{display: 'none'}}
                                >
                                    {hiddenInputs}
                                </div>
                            )}
                            {visibleCards.length > 0 && (
                                <div
                                    key="visible"
                                    className={colClass}
                                >
                                    {visibleCards.map((cardName, idx) =>
                                        renderCard(
                                            cardName,
                                            cards[cardName]!,
                                            cardName,
                                            idx === visibleCards.length - 1,
                                        ),
                                    )}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );

        // Wrap in DndContext when design mode is active so useSortable (in useDesignable) works
        if (onLayoutChange) {
            return (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={allVisibleCardIds}
                        strategy={rectSortingStrategy}
                    >
                        {gridContent}
                    </SortableContext>
                </DndContext>
            );
        }
        return gridContent;
    })();

    return (
        <form
            id={formId}
            onSubmit={onSubmit ? handleSubmit(handleFormSubmit) : undefined}
            className="blong-form"
            noValidate
        >
            {formBody}
        </form>
    );
}
