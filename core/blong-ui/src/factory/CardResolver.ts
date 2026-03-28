/**
 * CardResolver — resolve cards from schema properties.
 *
 * Cards group related fields into named containers. They can be
 * defined explicitly in component handlers or auto-derived from
 * `x-blong-group` annotations in the schema.
 */

import type {BlongSchema, BlongSchemaProperty, Card, Cards} from '../types.js';

/**
 * Auto-derive cards from schema properties based on `x-blong-group` annotations.
 *
 * Properties without a group are placed in the `default` card.
 */
export function deriveCardsFromSchema(schema: BlongSchema | undefined): Cards {
    if (!schema?.properties) return {default: {id: 'default', label: 'Details', widgets: []}};

    const groups = new Map<string, string[]>();

    for (const [name, prop] of Object.entries(schema.properties)) {
        const typedProp = prop as BlongSchemaProperty;
        if (typedProp['x-blong-hidden']) continue;

        const group = typedProp['x-blong-group'] ?? 'default';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(name);
    }

    const cards: Cards = {};
    for (const [groupName, fields] of groups) {
        // Sort fields by x-blong-order
        const sorted = fields.sort((a, b) => {
            const propA = schema.properties![a] as BlongSchemaProperty;
            const propB = schema.properties![b] as BlongSchemaProperty;
            return (propA['x-blong-order'] ?? 999) - (propB['x-blong-order'] ?? 999);
        });

        cards[groupName] = {
            id: groupName,
            label: groupName === 'default' ? 'Details' : capitalize(groupName),
            widgets: sorted,
        };
    }

    return cards;
}

/**
 * Merge explicit card definitions with schema-derived cards.
 *
 * Explicit cards take precedence. Schema-derived cards fill in
 * fields not covered by explicit cards.
 */
export function resolveCards(
    schema: BlongSchema | undefined,
    explicitCards?: Cards,
): Cards {
    if (explicitCards && Object.keys(explicitCards).length > 0) {
        return explicitCards;
    }
    return deriveCardsFromSchema(schema);
}

/**
 * Get the list of all field names referenced by a set of cards.
 */
export function getCardFieldNames(cards: Cards): Set<string> {
    const fields = new Set<string>();
    for (const card of Object.values(cards)) {
        for (const widget of card.widgets) {
            if (typeof widget === 'string') {
                fields.add(widget);
            } else if (Array.isArray(widget)) {
                for (const w of widget) fields.add(w);
            }
        }
    }
    return fields;
}

/**
 * Filter cards by permission.
 */
export function filterCardsByPermission(
    cards: Cards,
    hasPermission: (permission: string | undefined) => boolean,
): Cards {
    const filtered: Cards = {};
    for (const [key, card] of Object.entries(cards)) {
        if (hasPermission(card.permission)) {
            filtered[key] = card;
        }
    }
    return filtered;
}

/**
 * Evaluate conditional visibility for a card based on watch/match.
 */
export function isCardVisible(
    card: Card,
    watchValues: Record<string, unknown>,
): boolean {
    if (card.hidden) return false;
    if (!card.watch || !card.match) return true;

    const watchedValue = watchValues[card.watch];
    // Card is visible when the watched field value matches any value in the match object
    const expectedValues = Object.values(card.match);
    return expectedValues.includes(watchedValue);
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
