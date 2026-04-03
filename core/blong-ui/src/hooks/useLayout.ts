/**
 * useLayout — compute visible cards and fields from schema + card config + layout config.
 */
import type React from 'react';
import {useMemo} from 'react';
import type {ICardConfig, IEnrichedSchema} from '../types/widget.js';

export type LayoutRow = string | (string | string[])[];
export type FlatLayoutConfig = LayoutRow[];

/** A single tab/step item in a tab or steps layout */
export interface ILayoutTabItem {
    id: string;
    label?: string;
    icon?: string;
    /** Card names shown in this tab/step */
    widgets: string[];
    /** Optional React component rendered in place of cards (e.g. Explorer) */
    component?: React.ComponentType;
}

/** Tab or steps layout (object form) */
export interface ITabLayoutConfig {
    orientation?: 'top' | 'left' | 'bottom' | 'right';
    type?: 'steps';
    items: ILayoutTabItem[];
}

export type LayoutConfig = FlatLayoutConfig | ITabLayoutConfig;

/** Resolved card — enriched card config with derived field list */
export interface IResolvedCard {
    name: string;
    /** Card title; undefined means no title header (widget provides its own title) */
    label: string | undefined;
    fields: string[];
    config: ICardConfig;
}

/** A resolved tab/step */
export interface IResolvedTab {
    id: string;
    label: string;
    icon?: string;
    cardNames: string[];
    /** Optional React component rendered in place of cards */
    component?: React.ComponentType;
}

/** Result of useLayout */
export interface ILayoutResult {
    /** Resolved layout rows (array of decks, each deck is array of card names) — flat mode only */
    rows: string[][];
    /** Resolved cards with their field lists */
    cards: Record<string, IResolvedCard>;
    /** All visible field names */
    allFields: string[];
    /** Resolved tabs (populated in tab/steps mode, empty in flat mode) */
    tabs?: IResolvedTab[];
    /** Layout type: 'flat' | 'tabs' | 'steps' */
    layoutType: 'flat' | 'tabs' | 'steps';
    /** Tab orientation (only for tabs mode) */
    orientation?: string;
}

/** Type guard: is the layout config in tab/steps form? */
export function isTabLayout(config: LayoutConfig): config is ITabLayoutConfig {
    return !Array.isArray(config) && 'items' in config;
}

/**
 * Compute layout structure from schema + cards config + layout key.
 */
export function useLayout(
    schema: IEnrichedSchema | undefined,
    cardsConfig: Record<string, ICardConfig> | undefined,
    layoutKey: string,
    layouts: Record<string, LayoutConfig> | undefined,
): ILayoutResult {
    return useMemo(() => {
        const schemaProps = schema?.properties ?? {};
        const cards: Record<string, IResolvedCard> = {};

        // Step 1: Build card definitions from config + schema
        const cardDefs: Record<string, ICardConfig> = {...(cardsConfig ?? {})};

        // If no cards config, create a default card with all schema fields
        if (Object.keys(cardDefs).length === 0) {
            const allFieldNames = Object.keys(schemaProps);
            cardDefs['default'] = {
                label: schema?.title ?? 'Details',
                fields: allFieldNames,
            };
        }

        // Resolve each card's field list
        for (const [name, cardCfg] of Object.entries(cardDefs)) {
            let fields: string[];
            const widgetList = cardCfg.widgets ?? cardCfg.fields;
            if (Array.isArray(widgetList)) {
                fields = widgetList;
            } else if (widgetList && typeof widgetList === 'object') {
                fields = Object.keys(widgetList);
            } else {
                // Derive from schema: all schema fields
                fields = Object.keys(schemaProps);
            }
            // Only include fields present in the schema
            const validFields = fields.filter(f => f in schemaProps || !schema);
            cards[name] = {
                name,
                // undefined label → no card title (e.g. table widget provides its own title)
                label: 'label' in cardCfg ? cardCfg.label : name,
                fields: validFields,
                config: cardCfg,
            };
        }

        // Step 2: Resolve layout
        const layoutDef = layouts?.[layoutKey];

        if (layoutDef && isTabLayout(layoutDef)) {
            // Tab / steps layout
            const tabs: IResolvedTab[] = layoutDef.items.map(item => ({
                id: item.id,
                label: item.label ?? item.id,
                icon: item.icon,
                cardNames: item.widgets,
                component: item.component,
            }));
            const allTabCards = tabs.flatMap(t => t.cardNames);
            const allFields = [...new Set(allTabCards.flatMap(c => cards[c]?.fields ?? []))];
            return {
                rows: [],
                cards,
                allFields,
                tabs,
                layoutType: layoutDef.type === 'steps' ? 'steps' : 'tabs',
                orientation: layoutDef.orientation,
            };
        }

        // Flat layout
        let rows: string[][];
        if (layoutDef) {
            rows = flattenLayout(layoutDef as FlatLayoutConfig);
        } else {
            rows = Object.keys(cards).map(c => [c]);
        }
        const allFields = [...new Set(Object.values(cards).flatMap(c => c.fields))];

        return {rows, cards, allFields, layoutType: 'flat'};
    }, [schema, cardsConfig, layoutKey, layouts]);
}

/** Flatten layout definition to array of column groups.
 *
 * Each top-level element in the layout array = **one grid column**.
 * - A string element    → one card alone in that column.
 * - An array element    → multiple cards stacked vertically in that column.
 *
 * Examples:
 *   'habitat'               → [['habitat']]           (one column, one card)
 *   ['edit', 'denied']      → [['edit', 'denied']]    (one column, two stacked cards)
 *   [['edit'], ['denied']]  → [['edit', 'denied']]    (also one column — inner arrays merge)
 */
function flattenLayout(layout: FlatLayoutConfig): string[][] {
    const result: string[][] = [];
    for (const row of layout) {
        if (typeof row === 'string') {
            result.push([row]);
        } else if (Array.isArray(row)) {
            // All items in this array share ONE grid column
            const columnCards: string[] = [];
            for (const item of row) {
                if (typeof item === 'string') {
                    columnCards.push(item);
                } else if (Array.isArray(item)) {
                    columnCards.push(...item);
                }
            }
            if (columnCards.length) result.push(columnCards);
        }
    }
    return result;
}
