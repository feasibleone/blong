/**
 * useLayout — compute visible cards and fields from schema + card config + layout config.
 */
import {useMemo} from 'react';
import type {ICardConfig, IEnrichedSchema} from '../types/widget.js';

export type LayoutRow = string | (string | string[])[];
export type LayoutConfig = LayoutRow[];

/** Resolved card — enriched card config with derived field list */
export interface IResolvedCard {
    name: string;
    label: string;
    fields: string[];
    config: ICardConfig;
}

/** Result of useLayout */
export interface ILayoutResult {
    /** Resolved layout rows (array of decks, each deck is array of card names) */
    rows: string[][];
    /** Resolved cards with their field lists */
    cards: Record<string, IResolvedCard>;
    /** All visible field names */
    allFields: string[];
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
        const cardDefs: Record<string, ICardConfig> = cardsConfig ?? {};

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
            if (Array.isArray(cardCfg.fields)) {
                fields = cardCfg.fields;
            } else if (cardCfg.fields && typeof cardCfg.fields === 'object') {
                fields = Object.keys(cardCfg.fields);
            } else {
                // Derive from schema: fields not already assigned to another card
                fields = Object.keys(schemaProps);
            }
            // Only include fields present in the schema
            const validFields = fields.filter(f => f in schemaProps || !schema);
            cards[name] = {
                name,
                label: cardCfg.label,
                fields: validFields,
                config: cardCfg,
            };
        }

        // Step 2: Resolve layout rows
        const layoutDef = layouts?.[layoutKey];
        let rows: string[][];

        if (layoutDef) {
            rows = flattenLayout(layoutDef);
        } else {
            // Default: one row per card
            rows = Object.keys(cards).map(c => [c]);
        }

        const allFields = [...new Set(Object.values(cards).flatMap(c => c.fields))];

        return {rows, cards, allFields};
    }, [schema, cardsConfig, layoutKey, layouts]);
}

/** Flatten layout definition to array of decks (each deck is array of card names) */
function flattenLayout(layout: LayoutConfig): string[][] {
    const result: string[][] = [];
    for (const row of layout) {
        if (typeof row === 'string') {
            result.push([row]);
        } else if (Array.isArray(row)) {
            // Flatten inner arrays — multiple decks in one row
            const deckGroups: string[][] = [];
            for (const item of row) {
                if (typeof item === 'string') {
                    deckGroups.push([item]);
                } else if (Array.isArray(item)) {
                    deckGroups.push(item);
                }
            }
            result.push(...deckGroups);
        }
    }
    return result;
}
