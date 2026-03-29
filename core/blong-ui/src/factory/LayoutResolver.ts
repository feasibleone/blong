/**
 * LayoutResolver — resolve layouts from `x-blong-layout` or handler config.
 *
 * Layouts control how cards are arranged: simple lists, tabbed layouts,
 * or mode-specific arrangements.
 */

import type {Cards, Layout, Layouts, TabItem} from '../types.js';

/**
 * Auto-derive a default layout from cards.
 *
 * Places all cards in a single-column layout.
 */
export function deriveDefaultLayout(cards: Cards): Layout {
    return {
        cards: Object.keys(cards),
    };
}

/**
 * Derive standard layouts (edit + create) from cards.
 */
export function deriveLayouts(cards: Cards): Layouts {
    const allCardIds = Object.keys(cards);

    return {
        edit: {cards: allCardIds},
        create: {cards: allCardIds},
    };
}

/**
 * Resolve layouts by merging explicit definitions with auto-derived fallbacks.
 */
export function resolveLayouts(
    cards: Cards,
    explicitLayouts?: Layouts,
): Layouts {
    const derived = deriveLayouts(cards);

    if (!explicitLayouts || Object.keys(explicitLayouts).length === 0) {
        return derived;
    }

    // Merge: explicit layouts override derived ones
    return {...derived, ...explicitLayouts};
}

/**
 * Create a tabbed layout from groups of cards.
 */
export function createTabbedLayout(
    tabs: Array<{label: string; cards: string[]}>,
    orientation: 'horizontal' | 'vertical' = 'horizontal',
): Layout {
    const allCards = tabs.flatMap(t => t.cards);
    const items: TabItem[] = tabs.map(t => ({
        label: t.label,
        cards: t.cards,
    }));

    return {
        cards: allCards,
        items,
        orientation,
    };
}

/**
 * Get the cards for a specific tab, or all cards if no tabs defined.
 */
export function getTabCards(
    layout: Layout,
    tabIndex: number,
): string[] {
    if (!layout.items || layout.items.length === 0) {
        return layout.cards;
    }

    const tab = layout.items[tabIndex];
    return tab?.cards ?? [];
}

/**
 * Determine if a layout is tabbed.
 */
export function isTabbedLayout(layout: Layout): boolean {
    return !!layout.items && layout.items.length > 0;
}
