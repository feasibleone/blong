/**
 * useLayout — compute visible cards and fields from schema + card config + layout config.
 */
import type {
    FlatLayoutConfig,
    ICardConfig,
    ICardWidgetEntry,
    IEnrichedFieldSchema,
    IEnrichedSchema,
    ISplitLayoutConfig,
    ISplitLayoutPanel,
    ITabLayoutConfig,
    LayoutConfig,
} from '@feasibleone/blong';
import type React from 'react';
import {useMemo} from 'react';
export type {FlatLayoutConfig, ISplitLayoutConfig, LayoutConfig} from '@feasibleone/blong';

/** Resolved card — enriched card config with derived field list */
export interface IResolvedCard {
    name: string;
    /** Card title; undefined means no title header (widget provides its own title) */
    label: string | undefined;
    fields: string[];
    config: ICardConfig;
    /**
     * Per-entry column overrides for ICardWidgetEntry objects.
     * Key is 'fieldName#id' (e.g. 'table#table1'); value is the column list.
     */
    columnOverrides?: Record<string, string[]>;
}

/** A resolved tab/step */
export interface IResolvedTab {
    id: string;
    label?: string;
    icon?: string;
    /** Each entry is a deck-group: one or more card names stacked in the same grid column. */
    cardNames: string[][];
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
    /** Layout type: 'flat' | 'tabs' | 'steps' | 'split' */
    layoutType: 'flat' | 'tabs' | 'steps' | 'split';
    /** Tab orientation (only for tabs mode) */
    orientation?: string;
    /** Split layout panels (only for split mode) */
    panels?: ISplitLayoutPanel[];
}

/** Type guard: is the layout config in tab/steps form? */
export function isTabLayout(config: LayoutConfig): config is ITabLayoutConfig {
    return !Array.isArray(config) && 'items' in config;
}

/** Type guard: is the layout config a split layout? */
export function isSplitLayout(config: LayoutConfig): config is ISplitLayoutConfig {
    return !Array.isArray(config) && (config as ISplitLayoutConfig).type === 'split';
}

/**
 * Check whether a dot-notation field path resolves to a leaf property in the schema.
 * E.g. 'input.input' checks schema.properties.input.properties.input.
 * Single-segment paths (e.g. 'table') are checked directly in schemaProps.
 * Paths with '#id' suffix (ICardWidgetEntry column-override keys) strip the suffix first.
 */
function schemaHasField(
    schemaProps: Record<string, IEnrichedFieldSchema>,
    fieldPath: string,
): boolean {
    // Strip '#id' suffix generated for ICardWidgetEntry column overrides (e.g. 'table#table1')
    const hashIdx = fieldPath.indexOf('#');
    const basePath = hashIdx >= 0 ? fieldPath.slice(0, hashIdx) : fieldPath;
    const dot = basePath.indexOf('.');
    if (dot === -1) return basePath in schemaProps;
    const head = basePath.slice(0, dot);
    const tail = basePath.slice(dot + 1);
    const nested = schemaProps[head]?.properties;
    return nested != null && schemaHasField(nested as Record<string, IEnrichedFieldSchema>, tail);
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
            const columnOverrides: Record<string, string[]> = {};
            const widgetList = cardCfg.widgets ?? cardCfg.fields;
            if (Array.isArray(widgetList)) {
                fields = [];
                for (const entry of widgetList) {
                    if (typeof entry === 'string') {
                        fields.push(entry);
                    } else {
                        // ICardWidgetEntry: encode as 'fieldName#id'
                        const key = `${entry.name}#${entry.id}`;
                        fields.push(key);
                        columnOverrides[key] = (entry as ICardWidgetEntry).widgets;
                    }
                }
            } else if (widgetList && typeof widgetList === 'object') {
                fields = Object.keys(widgetList);
            } else {
                // Derive from schema: all schema fields
                fields = Object.keys(schemaProps);
            }
            // Watch cards contain sub-fields of the watched array — skip top-level schema filter
            const isWatchCard = !!cardCfg.watch;
            // Only include fields present in the schema (unless it's a watch/detail card or schema is absent)
            // Supports dot-notation paths like 'input.input' and 'table#table1' column-override entries.
            const validFields =
                isWatchCard || !schema
                    ? fields
                    : fields.filter(f =>
                          schemaHasField(schemaProps as Record<string, IEnrichedFieldSchema>, f),
                      );
            cards[name] = {
                name,
                // undefined label → no card title (e.g. table widget provides its own title)
                label: 'label' in cardCfg ? cardCfg.label : name,
                fields: validFields,
                config: cardCfg,
                ...(Object.keys(columnOverrides).length > 0 ? {columnOverrides} : {}),
            };
        }

        // Step 2: Resolve layout
        const layoutDef = layouts?.[layoutKey];

        if (layoutDef && isTabLayout(layoutDef)) {
            // Tab / steps layout
            const tabs: IResolvedTab[] = layoutDef.items.map(item => ({
                id: item.id,
                label: item.label,
                icon: item.icon,
                // Reuse flattenLayout so tab widgets follow the same deck-grouping rules
                // as the flat layout: 'a1' → [['a1']], ['a1','a2'] → [['a1','a2']]
                cardNames: item.component ? [] : flattenLayout(item.widgets as FlatLayoutConfig),
                component: item.component,
            }));
            const allTabCards = tabs.flatMap(t => t.cardNames.flat());
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

        if (layoutDef && isSplitLayout(layoutDef)) {
            // Split layout — resizable panels side by side
            const panels = layoutDef.panels;
            const allPanelCards = panels.flatMap(p => p.cards);
            const allFields = [...new Set(allPanelCards.flatMap(c => cards[c]?.fields ?? []))];
            return {
                rows: [],
                cards,
                allFields,
                layoutType: 'split',
                orientation: layoutDef.orientation ?? 'horizontal',
                panels,
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
