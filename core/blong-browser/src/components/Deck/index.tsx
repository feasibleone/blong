/**
 * Deck — layout orchestrator and card column container.
 *
 * Three modes:
 *
 * 1. **Root layout mode** (`id="root"`, no `cardNames`): activated when the Deck is
 *    rendered inside a Form (FormContext present) without explicit cardNames. Reads
 *    layoutResult, layout, formId, and onLayoutChange from FormContext and renders the
 *    full layout — flat grid, tabs, steps, or split. This is the layout orchestrator role;
 *    design-mode DnD lives here.
 *
 * 2. **Context-driven** (`cardNames` prop): resolves cards from the nearest Form's
 *    FormContext, applies permission/match/hidden filtering, renders hidden inputs for
 *    invisible cards, and stacks visible Card components. This is the normal mode for
 *    column Decks inside a flat or split layout.
 *
 * 3. **Passthrough** (no `cardNames`, no FormContext layout): renders `children` as-is
 *    with mb-3 spacing applied to every non-last child. Used for standalone layouts and
 *    tests.
 *
 * In context-driven and root modes, design-mode DropZones are shown where applicable.
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
import type {ICardConfig} from '@feasibleone/blong';
import React, {useState, type ReactNode} from 'react';
import {Controller} from 'react-hook-form';
import {DropZone} from '../../design/DropZone.js';
import {useDesignMode} from '../../design/useDesignMode.js';
import type {FlatLayoutConfig, IResolvedCard, IResolvedTab} from '../../hooks/useLayout.js';
import {PanelMenu, Splitter, SplitterPanel, Steps, TabMenu} from '../../primereact/index.js';
import {Card} from '../Card/index.js';
import {useBlongForm} from '../Form/FormContext.js';

export interface IDeckProps {
    id: string;
    /** When provided, renders these cards from FormContext (context-driven mode). */
    cardNames?: string[];
    /**
     * Card names to render as hidden inputs only (hidden: true in card config).
     * Only used in context-driven mode.
     */
    hiddenCardNames?: string[];
    /** Passthrough children — used when cardNames is not provided. */
    children?: ReactNode;
    readOnly?: boolean;
    loading?: boolean;
    className?: string;
}

// ── Helper: render a grid of column Decks from grouped card name arrays ───────

function TabContent({
    deckGroups,
    cards,
}: {
    deckGroups: string[][];
    cards: Record<string, IResolvedCard>;
}) {
    return (
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
}

// ── Root layout mode ──────────────────────────────────────────────────────────

function RootDeck() {
    const formCtx = useBlongForm();
    // Safety guard: RootDeck is only rendered by Deck when FormContext is present
    if (!formCtx?.layoutResult) return null;
    const {layoutResult, layout, formId, onLayoutChange, cards} = formCtx;
    const {layoutType, rows, tabs, orientation, panels} = layoutResult;

    const designCtx = useDesignMode();
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 5}}));
    const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    // ── Split layout ───────────────────────────────────────────────────────
    if (layoutType === 'split') {
        const splitPanels = panels ?? [];
        const splitterLayout = orientation === 'vertical' ? 'vertical' : 'horizontal';
        return (
            <Splitter
                layout={splitterLayout}
                gutterSize={4}
                style={{height: '100%'}}
            >
                {splitPanels.map((panel, idx) => (
                    <SplitterPanel
                        key={idx}
                        size={panel.size}
                        minSize={panel.minSize ?? 5}
                        style={{overflow: 'auto'}}
                    >
                        {panel.cards.map((cardName, ci) => {
                            const resolved = cards[cardName];
                            if (!resolved) return null;
                            return (
                                <Card
                                    key={cardName}
                                    cardName={cardName}
                                    colIdx={idx}
                                    className={
                                        ci < panel.cards.length - 1 ? 'w-full mb-3' : 'w-full'
                                    }
                                />
                            );
                        })}
                    </SplitterPanel>
                ))}
            </Splitter>
        );
    }

    // ── Tab / steps layout ─────────────────────────────────────────────────
    if (layoutType === 'tabs' || layoutType === 'steps') {
        const resolvedTabs = tabs ?? [];
        const activeEntry: IResolvedTab | undefined = resolvedTabs[activeTabIndex];
        const tabContent = activeEntry?.component ? (
            React.createElement(activeEntry.component)
        ) : activeEntry ? (
            <TabContent
                deckGroups={activeEntry.cardNames}
                cards={cards}
            />
        ) : null;

        if (layoutType === 'steps') {
            const stepItems = resolvedTabs.map((t: IResolvedTab) => ({
                label: t.label,
                icon: t.icon,
            }));
            const isFirst = activeTabIndex === 0;
            const isLast = activeTabIndex === resolvedTabs.length - 1;
            return (
                <div className="blong-form-steps">
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
                            form={isLast ? formId : undefined}
                            className="p-button p-component p-button-text p-button-icon-only m-1"
                            aria-label={isLast ? 'Save' : 'Next'}
                            onClick={isLast ? undefined : () => setActiveTabIndex(i => i + 1)}
                        >
                            <span
                                className={`p-button-icon pi ${isLast ? 'pi-save' : 'pi-caret-right'}`}
                            />
                        </button>
                    </div>
                    <div className="blong-form-tab-content">{tabContent}</div>
                </div>
            );
        }

        // Tabs layout
        const orient = orientation ?? 'top';
        if (orient === 'left' || orient === 'right') {
            const panelItems = resolvedTabs.map((t: IResolvedTab, i: number) => ({
                id: t.id,
                label: t.label,
                icon: t.icon,
                className: i === activeTabIndex ? 'p-highlight' : '',
                command: () => setActiveTabIndex(i),
            }));
            return (
                <div
                    className={`blong-form-panel-layout blong-form-panel-layout--${orient}`}
                    style={{
                        display: 'flex',
                        flexDirection: orient === 'left' ? 'row' : 'row-reverse',
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

        const tabItems = resolvedTabs.map((t: IResolvedTab) => ({
            label: t.label,
            icon: t.icon,
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

    // ── Flat layout with DnD design mode ──────────────────────────────────
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
                const toColIdx = parseInt(overId.replace('col-end:', ''), 10);
                if (Number.isNaN(toColIdx)) return;
                const from = findCard(activeCardName);
                if (!from) return;
                if (from.ci === toColIdx) return;
                const newRows = rows.map(col => [...col]);
                newRows[from.ci].splice(from.idx, 1);
                if (!newRows[toColIdx]) return;
                newRows[toColIdx].push(activeCardName);
                applyNewRows(newRows);
            } else if (overId.startsWith('card-') && !overId.startsWith('card-end:')) {
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
                    toFields.splice(insertIdx === -1 ? toFields.length : insertIdx, 0, fromField);
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

    if (designCtx.active && onLayoutChange) {
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
                    {activeDragLabel && <div className="blong-drag-ghost">{activeDragLabel}</div>}
                </DragOverlay>
            </DndContext>
        );
    }
    return gridContent;
}

// ── Main Deck export ──────────────────────────────────────────────────────────

export function Deck({id, cardNames, hiddenCardNames, children, className}: IDeckProps) {
    const {active: isDesignMode} = useDesignMode();
    const formCtx = useBlongForm();

    // Root layout mode: delegate to RootDeck when id='root', no cardNames, and FormContext has layout info
    if (id === 'root' && cardNames === undefined && formCtx?.layoutResult) {
        return <RootDeck />;
    }

    // Extract the column index from id ('deck-0', 'deck-1', ...) for DnD
    const colIdx = parseInt(id.replace(/^deck-/, ''), 10);

    let body: ReactNode;

    if (cardNames !== undefined && formCtx) {
        // Context-driven mode — filter and render cards
        const {cards, tableSelections, checkPermission, control, schema} = formCtx;

        const visibleCards = cardNames.filter(name => {
            const resolved = cards[name];
            if (!resolved) return false;
            if (resolved.config.permission !== undefined) {
                return !!checkPermission?.(resolved.config.permission);
            }
            // Match-based polymorphic card: only show when the watched selection matches
            if (resolved.config.match) {
                const rawWatch = resolved.config.watch;
                const watchField = rawWatch?.startsWith('$.selected.')
                    ? rawWatch.slice('$.selected.'.length)
                    : rawWatch;
                if (!watchField) return false;
                const selection = tableSelections[watchField];
                if (!selection) return false;
                return Object.entries(resolved.config.match).every(
                    ([k, v]) => selection.row[k] === v,
                );
            }
            return true;
        });

        // Hidden cards — render only as hidden <input> elements so form values
        // for those fields are still registered with react-hook-form.
        const hiddenInputs = (hiddenCardNames ?? []).flatMap(cardName => {
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

        // Apply mb-3 to every visible card except the last
        const cardElements = visibleCards.map((cardName, idx) => {
            const isLast = idx === visibleCards.length - 1;
            return (
                <Card
                    key={cardName}
                    cardName={cardName}
                    colIdx={colIdx}
                    className={isLast ? 'w-full' : 'w-full mb-3'}
                />
            );
        });

        body = (
            <>
                {hiddenInputs.length > 0 && <div style={{display: 'none'}}>{hiddenInputs}</div>}
                {cardElements}
            </>
        );
    } else {
        // Passthrough mode — add mb-3 to every child except the last
        const childArray = React.Children.toArray(children);
        body = childArray.map((child, idx) => {
            const isLast = idx === childArray.length - 1;
            if (isLast || !React.isValidElement(child)) return child;
            const currentClass = (child.props as {className?: string}).className ?? '';
            return React.cloneElement(child as React.ReactElement<{className?: string}>, {
                className: [currentClass, 'mb-3'].filter(Boolean).join(' '),
            });
        });
    }

    return (
        <div className={['blong-deck', className ?? ''].filter(Boolean).join(' ')}>
            {body}
            {isDesignMode && (
                <DropZone
                    id={`col-end:${colIdx}`}
                    accept="card"
                    sourceId={colIdx}
                />
            )}
        </div>
    );
}
