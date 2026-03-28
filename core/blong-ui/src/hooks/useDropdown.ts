/**
 * useDropdown — automatic dropdown field discovery and batch fetch.
 *
 * Discovers lookup fields from the active layout's cards, issues a single
 * batch fetch via the `onDropdown` convention, and caches results with
 * TanStack Query.
 */

import {useQuery} from '@tanstack/react-query';

import type {Cards, DropdownOption, Dropdowns, BlongSchema, BlongSchemaProperty} from '../types.js';
import {rpcCall} from './useApi.js';

/**
 * Discover lookup field names from cards and the backing schema.
 *
 * A field is a dropdown when:
 * - Its schema property has `x-blong-lookup` set, OR
 * - Its schema property has `x-blong-widget` set to `dropdown`, `select`,
 *   `multiSelect`, or similar list-based widgets, OR
 * - Its schema property has an `enum` constraint.
 */
export function discoverDropdownFields(
    schema: BlongSchema | undefined,
    cards: Cards | undefined,
): string[] {
    if (!schema?.properties || !cards) return [];

    const lookupWidgets = new Set([
        'dropdown',
        'dropdownTree',
        'select',
        'multiSelect',
        'multiSelectTree',
        'multiSelectPanel',
        'multiSelectTreeTable',
        'selectTable',
    ]);

    const fields = new Set<string>();

    // Collect all field names referenced by cards
    const cardFields = new Set<string>();
    for (const card of Object.values(cards)) {
        for (const widget of card.widgets) {
            if (typeof widget === 'string') {
                cardFields.add(widget);
            } else if (Array.isArray(widget)) {
                for (const w of widget) cardFields.add(w);
            }
        }
    }

    // Check each card field against the schema
    for (const fieldName of cardFields) {
        const prop = schema.properties[fieldName] as BlongSchemaProperty | undefined;
        if (!prop) continue;

        if (prop['x-blong-lookup']) {
            fields.add(prop['x-blong-lookup']);
        } else if (prop['x-blong-widget'] && lookupWidgets.has(prop['x-blong-widget'])) {
            fields.add(fieldName);
        } else if (prop.enum) {
            fields.add(fieldName);
        }
    }

    return [...fields];
}

/** Options for the useDropdown hook. */
export interface UseDropdownOptions {
    /** The backing schema for the form. */
    schema?: BlongSchema;
    /** The active cards configuration. */
    cards?: Cards;
    /** JSON-RPC method name for fetching dropdown data (default: 'ui.dropdown.get'). */
    method?: string;
    /** Whether to enable the query (default: true). */
    enabled?: boolean;
    /** Parent field values for cascaded dropdown filtering. */
    parentValues?: Record<string, unknown>;
}

/**
 * Hook to auto-discover dropdown fields and batch-fetch their options.
 *
 * @example
 * ```tsx
 * const { dropdowns, isLoading } = useDropdown({
 *     schema: methodSchema.request,
 *     cards: myCards,
 * });
 * // dropdowns['countryId'] → [{ value: 'US', label: 'United States' }, ...]
 * ```
 */
export function useDropdown(options: UseDropdownOptions = {}) {
    const {
        schema,
        cards,
        method = 'ui.dropdown.get',
        enabled = true,
        parentValues,
    } = options;

    const lookupFields = discoverDropdownFields(schema, cards);
    const hasFields = lookupFields.length > 0;

    const query = useQuery<Dropdowns>({
        queryKey: ['blong-dropdowns', method, lookupFields, parentValues],
        queryFn: () =>
            rpcCall<Dropdowns>(method, {
                fields: lookupFields,
                parentValues,
            }),
        enabled: enabled && hasFields,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });

    /**
     * Get dropdown options for a specific field, optionally filtered by parent value.
     */
    const getOptions = (
        field: string,
        parentValue?: string | number,
    ): DropdownOption[] => {
        const allOptions = query.data?.[field];
        if (!allOptions) return [];
        if (parentValue == null) return allOptions;
        return allOptions.filter(opt => opt.parent === parentValue);
    };

    return {
        /** All dropdown data keyed by field/lookup name. */
        dropdowns: query.data ?? ({} as Dropdowns),
        /** Get filtered options for a specific field. */
        getOptions,
        /** Discovered lookup field names. */
        lookupFields,
        /** Whether dropdown data is loading. */
        isLoading: query.isLoading,
        /** Whether the fetch failed. */
        isError: query.isError,
        /** The error, if any. */
        error: query.error,
    };
}
