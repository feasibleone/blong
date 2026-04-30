/**
 * Form — schema-driven form component.
 *
 * Renders a hierarchy of Deck → Card → field for every field in the schema.
 * Supports flat layout, tab layout, and steps layout.
 * Driven by react-hook-form internally; publishes flattened values via onChange/onSubmit.
 *
 * Form's responsibilities:
 *  - react-hook-form setup (control, errors, reset, watch)
 *  - Table-row selection state (for master-detail / watch cards)
 *  - Layout structure: resolves rows/tabs/steps and renders Deck components
 *  - Design-mode DnD (card reordering across columns)
 *  - Provides FormContext so Deck and Card can render without prop-drilling
 */
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {PanelMenu, Steps, TabMenu} from '../../primereact/index.js';
import './index.css';

import React, {useCallback, useEffect, useId, useMemo, useState} from 'react';
import {useForm, type FieldErrors, type SubmitHandler} from 'react-hook-form';
import {useDesignMode} from '../../design/useDesignMode.js';
import {useLayout, type FlatLayoutConfig, type LayoutConfig} from '../../hooks/useLayout.js';
import {useAppStore} from '../../state/appStore.js';
import type {ICardConfig, IEnrichedFieldSchema, IEnrichedSchema} from '../../types/widget.js';
import {Deck} from '../Deck/index.js';
import {FormContext} from './FormContext.js';

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
    /**
     * Optional side panel rendered alongside the form (e.g. the design inspector).
     * Rendered inside FormContext.Provider but outside the <form> element so its
     * inputs do not participate in form submission.
     */
    rightPanel?: React.ReactNode;
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
    rightPanel,
}: IFormProps) {
    const fallbackId = useId();
    const formId = id ?? fallbackId;

    // Design mode — merge designCtx.config.cards overrides into cardsConfig so
    // layout and field ordering reflect real-time design changes.
    const designCtx = useDesignMode();
    const effectiveCards = useMemo<Record<string, ICardConfig> | undefined>(() => {
        if (!designCtx.active || !cardsConfig) return cardsConfig;
        const result: Record<string, ICardConfig> = {};
        for (const [name, card] of Object.entries(cardsConfig)) {
            const override = designCtx.config.cards[name] as ICardConfig | undefined;
            result[name] = override ? {...card, ...override} : card;
        }
        // Include design-created cards not in original config
        for (const [name, override] of Object.entries(designCtx.config.cards)) {
            if (!(name in result)) result[name] = override as ICardConfig;
        }
        return result;
    }, [cardsConfig, designCtx.active, designCtx.config.cards]);

    // Merge per-field schema overrides from design mode (title, widget type, readOnly, etc.)
    const effectiveSchema = useMemo(() => {
        if (!designCtx.active || !schema) return schema;
        const overrides = designCtx.config.schema;
        if (!overrides || Object.keys(overrides).length === 0) return schema;
        const newProps = {...schema.properties};
        for (const [fieldName, override] of Object.entries(overrides)) {
            if (newProps[fieldName]) {
                newProps[fieldName] = {...newProps[fieldName], ...override};
                // Merge widget overrides (partial)
                const o = override as {widget?: Record<string, unknown>};
                if (o.widget && newProps[fieldName].widget) {
                    newProps[fieldName] = {
                        ...newProps[fieldName],
                        widget: {
                            ...(newProps[fieldName].widget as object),
                            ...o.widget,
                        } as unknown as IEnrichedFieldSchema['widget'],
                    };
                }
            }
        }
        return {...schema, properties: newProps};
    }, [schema, designCtx.active, designCtx.config.schema]);

    const layoutResult = useLayout(effectiveSchema, effectiveCards, layout, layouts);
    const {rows, cards, tabs, layoutType} = layoutResult;

    const [activeTabIndex, setActiveTabIndex] = useState(0);

    /**
     * Tracks rows selected in table widgets with selectionMode: 'single'.
     * Key = field name; value = {row, index} (without __key) or null.
     */
    const [tableSelections, setTableSelections] = useState<
        Record<string, {row: Record<string, unknown>; index: number} | null>
    >({});

    const handleTableSelect = useCallback(
        (fieldName: string, selection: {row: Record<string, unknown>; index: number} | null) => {
            setTableSelections(prev => ({...prev, [fieldName]: selection}));
        },
        [],
    );

    // Pointer sensor for design-mode drag-drop
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 5}}));

    /** Label of the item currently being dragged (for DragOverlay ghost) */
    const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

    const {
        control,
        handleSubmit,
        reset,
        setError,
        watch,
        setValue,
        formState: {errors},
    } = useForm<Record<string, unknown>>({
        defaultValues: value ?? {},
        mode: 'onBlur',
    });

    const rawFormValues = watch();

    /**
     * Extended form values — includes raw form values plus table selections.
     * Table selections are stored under __sel_{fieldName} so cascaded dropdowns
     * and watch/match cards can react to row selection.
     */
    const formValues: Record<string, unknown> = {
        ...rawFormValues,
        ...Object.fromEntries(Object.entries(tableSelections).map(([k, v]) => [`__sel_${k}`, v])),
    };

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

    const handleFormInvalid = (fieldErrors: FieldErrors<Record<string, unknown>>) => {
        const count = Object.keys(fieldErrors).length;
        if (count === 0) return;
        useAppStore.getState().showToast({
            severity: 'error',
            summary: 'Validation error',
            detail:
                count === 1
                    ? 'Please correct the highlighted field.'
                    : `Please correct ${count} highlighted fields.`,
        });
    };

    /** Render tab or step content — a grid of Deck columns from deck groups. */
    const renderTabContent = (deckGroups: string[][]) => (
        <div className="grid col align-self-start max-w-screen">
            {deckGroups.map((groupNames, groupIdx) => {
                if (!groupNames.length) return null;
                const firstResolved = groupNames.map(n => cards[n]).find(Boolean);
                const colClass = firstResolved?.config.className ?? 'col-12 xl:col-6';
                return (
                    <Deck
                        key={groupIdx}
                        id={`deck-tab-${groupIdx}`}
                        className={colClass}
                        cardNames={groupNames}
                    />
                );
            })}
        </div>
    );

    const formBody = (() => {
        if (layoutType === 'tabs') {
            const orientation = layoutResult.orientation ?? 'top';
            const activeTab = (tabs ?? [])[activeTabIndex];
            const tabContent = activeTab?.component
                ? React.createElement(activeTab.component)
                : activeTab
                  ? renderTabContent(activeTab.cardNames)
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
                            className="blong-form-panelmenu flex-none"
                        />
                        <div className="blong-form-panel-content flex-1">{tabContent}</div>
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
                        className="blong-form-tab-menu"
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
                  ? renderTabContent(activeStep.cardNames)
                  : null;
            const isFirst = activeTabIndex === 0;
            const isLast = activeTabIndex === (tabs ?? []).length - 1;
            return (
                <div className="blong-form-steps">
                    {/* Navigation bar: ← [Steps indicator] → centered as a group */}
                    <div className="blong-form-steps__nav flex align-items-center justify-content-center sticky top-0 z-1 surface-0">
                        <button
                            type="button"
                            className={`p-button p-component p-button-text p-button-icon-only m-1${isFirst ? ' p-disabled' : ''}`}
                            aria-label="Back"
                            disabled={isFirst}
                            onClick={() => setActiveTabIndex(i => i - 1)}
                        >
                            <span className="p-button-icon pi pi-caret-left" />
                        </button>
                        <Steps
                            model={stepItems}
                            activeIndex={activeTabIndex}
                            onSelect={e => setActiveTabIndex(e.index)}
                            className="blong-steps-indicator"
                        />
                        <button
                            type={isLast ? 'submit' : 'button'}
                            form={isLast ? id : undefined}
                            className="p-button p-component p-button-text p-button-icon-only m-1"
                            aria-label={isLast ? 'Save' : 'Next'}
                            onClick={isLast ? undefined : () => setActiveTabIndex(i => i + 1)}
                        >
                            <span
                                className={`p-button-icon pi ${isLast ? 'pi-save' : 'pi-caret-right'}`}
                            />
                        </button>
                    </div>
                    <div className="blong-form-tab-content">{stepContent}</div>
                </div>
            );
        }

        // Flat layout — single PrimeFlex grid.
        // Each element of `rows` is a column group (may contain multiple stacked cards).
        // Deck handles permission/match filtering and hidden-input rendering internally.

        // All non-hidden card ids for DnD (no SortableContext needed — we use useDraggable directly)

        /**
         * handleDragEnd — handles card and field moves in design mode.
         * - card over card-{name}       → insert dragged card at that position
         * - card over col-end:{colIdx}  → append card to column
         * - field over field:{f}:{c}    → insert dragged field before that field
         * - field over card-end:{c}     → append field to card
         */
        const handleDragEnd = (event: DragEndEvent) => {
            setActiveDragLabel(null);
            const {active, over} = event;
            if (!over || active.id === over.id) return;

            const activeId = String(active.id);
            const overId = String(over.id);
            const activeType = active.data.current?.type as string | undefined;

            const findCard = (name: string) => {
                for (let ci = 0; ci < rows.length; ci++) {
                    const idx = rows[ci].indexOf(name);
                    if (idx !== -1) return {ci, idx};
                }
                return null;
            };

            const applyNewRows = (newRows: string[][]) => {
                const filteredRows = newRows.filter(col => col.length > 0);
                const newLayoutConfig: FlatLayoutConfig = filteredRows.map(group =>
                    group.length === 1 ? group[0] : group,
                );
                onLayoutChange?.(layout, newLayoutConfig);
            };

            if (activeType === 'card') {
                const activeCardName = activeId.replace(/^card-/, '');

                if (overId.startsWith('col-end:')) {
                    // Append card to the end of the target column
                    const toColIdx = parseInt(overId.replace('col-end:', ''), 10);
                    const from = findCard(activeCardName);
                    if (!from) return;
                    if (from.ci === toColIdx) return; // already in same column
                    const newRows = rows.map(col => [...col]);
                    newRows[from.ci].splice(from.idx, 1);
                    if (!newRows[toColIdx]) return;
                    newRows[toColIdx].push(activeCardName);
                    applyNewRows(newRows);
                } else if (overId.startsWith('card-') && !overId.startsWith('card-end:')) {
                    // Insert before another card (same or different column)
                    const overCardName = overId.replace(/^card-/, '');
                    const from = findCard(activeCardName);
                    const to = findCard(overCardName);
                    if (!from || !to) return;
                    const newRows = rows.map(col => [...col]);
                    newRows[from.ci].splice(from.idx, 1);
                    const insertIdx = from.ci === to.ci && to.idx > from.idx ? to.idx - 1 : to.idx;
                    newRows[to.ci].splice(insertIdx, 0, activeCardName);
                    applyNewRows(newRows);
                }
            } else if (activeType === 'field') {
                // Parse 'field:{fieldName}:{cardName}'
                const withoutPrefix = activeId.replace(/^field:/, '');
                const firstColon = withoutPrefix.indexOf(':');
                if (firstColon === -1) return;
                const fromField = withoutPrefix.substring(0, firstColon);
                const fromCard = withoutPrefix.substring(firstColon + 1);

                const moveField = (targetField: string | null, targetCard: string) => {
                    const fromCardResolved = cards[fromCard];
                    const toCardResolved = cards[targetCard];
                    if (!fromCardResolved) return;

                    const fromFields = [...fromCardResolved.fields];
                    const toFields =
                        fromCard === targetCard ? fromFields : [...(toCardResolved?.fields ?? [])];

                    const fromIdx = fromFields.indexOf(fromField);
                    if (fromIdx === -1) return;
                    fromFields.splice(fromIdx, 1);

                    if (fromCard === targetCard) {
                        const insertIdx =
                            targetField !== null
                                ? Math.max(0, fromFields.indexOf(targetField))
                                : fromFields.length;
                        fromFields.splice(insertIdx, 0, fromField);
                        designCtx.updateConfig({
                            cards: {
                                ...designCtx.config.cards,
                                [fromCard]: {
                                    ...(designCtx.config.cards[fromCard] ?? {}),
                                    widgets: fromFields,
                                    fields: undefined,
                                } as ICardConfig,
                            },
                        });
                    } else {
                        const insertIdx = targetField !== null ? toFields.indexOf(targetField) : -1;
                        toFields.splice(
                            insertIdx === -1 ? toFields.length : insertIdx,
                            0,
                            fromField,
                        );
                        designCtx.updateConfig({
                            cards: {
                                ...designCtx.config.cards,
                                [fromCard]: {
                                    ...(designCtx.config.cards[fromCard] ?? {}),
                                    widgets: fromFields,
                                    fields: undefined,
                                } as ICardConfig,
                                [targetCard]: {
                                    ...(designCtx.config.cards[targetCard] ?? {}),
                                    widgets: toFields,
                                    fields: undefined,
                                } as ICardConfig,
                            },
                        });
                    }
                };

                if (overId.startsWith('card-end:')) {
                    const toCard = overId.replace('card-end:', '');
                    if (fromCard === toCard) return;
                    moveField(null, toCard);
                } else if (overId.startsWith('field:')) {
                    // Drop onto another field row — insert dragged field before it
                    const rest = overId.replace(/^field:/, '');
                    const colonIdx = rest.indexOf(':');
                    if (colonIdx === -1) return;
                    const targetField = rest.substring(0, colonIdx);
                    const targetCard = rest.substring(colonIdx + 1);
                    moveField(targetField, targetCard);
                }
            }
        };

        const gridContent = (
            <div className="grid col align-self-start max-w-screen">
                {rows.map((columnCards, colIdx) => {
                    const hiddenCards = columnCards.filter(name => cards[name]?.config.hidden);
                    const nonHiddenCards = columnCards.filter(name => !cards[name]?.config.hidden);
                    if (!nonHiddenCards.length && !hiddenCards.length) return null;
                    // Use first non-hidden card's className for the column width
                    const firstCard = nonHiddenCards[0] ? cards[nonHiddenCards[0]] : undefined;
                    const colClass = firstCard?.config.className ?? 'col-12 xl:col-6';
                    return (
                        <Deck
                            key={colIdx}
                            id={`deck-${colIdx}`}
                            className={colClass}
                            cardNames={nonHiddenCards}
                            hiddenCardNames={hiddenCards}
                        />
                    );
                })}
            </div>
        );

        // Wrap in DndContext when design mode is active so useDraggable / useDroppable work
        if (onLayoutChange) {
            return (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={({active: a}) =>
                        setActiveDragLabel((a.data.current?.label as string | undefined) ?? null)
                    }
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveDragLabel(null)}
                >
                    {gridContent}
                    <DragOverlay dropAnimation={null}>
                        {activeDragLabel && (
                            <div className="blong-drag-ghost">{activeDragLabel}</div>
                        )}
                    </DragOverlay>
                </DndContext>
            );
        }
        return gridContent;
    })();

    return (
        <FormContext
            value={{
                schema: effectiveSchema,
                cards,
                control,
                errors,
                rawFormValues,
                formValues,
                readOnly,
                loading,
                dropdowns,
                onChange,
                tableSelections,
                handleTableSelect,
                setValue,
                checkPermission,
            }}
        >
            {rightPanel ? (
                <div className="blong-form-layout">
                    <form
                        id={formId}
                        onSubmit={handleSubmit(handleFormSubmit, handleFormInvalid)}
                        className="blong-form"
                        noValidate
                    >
                        {formBody}
                    </form>
                    {rightPanel}
                </div>
            ) : (
                <form
                    id={formId}
                    onSubmit={handleSubmit(handleFormSubmit, handleFormInvalid)}
                    className="blong-form"
                    noValidate
                >
                    {formBody}
                </form>
            )}
        </FormContext>
    );
}
