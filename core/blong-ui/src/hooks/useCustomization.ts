/**
 * useCustomization — load, merge and save per-component UI customisations.
 *
 * Customisations (schema overrides, cards, layouts) are fetched from the
 * server via `ui.customization.get` and merged with defaults at runtime.
 * The `saveCustomization` function persists changes via `ui.customization.edit`.
 */

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import type {
    BlongSchema,
    BlongSchemaProperty,
    Cards,
    Customisation,
    Layouts,
} from '../types.js';
import {rpcCall} from './useApi.js';

/** Options for the useCustomization hook. */
export interface UseCustomizationOptions {
    /** Component identifier. */
    componentId: string;
    /** Default schema from the OpenAPI spec. */
    defaultSchema?: BlongSchema;
    /** Default cards from the component handler. */
    defaultCards?: Cards;
    /** Default layouts from the component handler. */
    defaultLayouts?: Layouts;
    /** Whether to enable the query (default: true). */
    enabled?: boolean;
}

/**
 * Deeply merge schema property overrides into the default schema.
 */
function mergeSchema(
    defaultSchema: BlongSchema | undefined,
    overrides: Record<string, Partial<BlongSchemaProperty>> | undefined,
): BlongSchema | undefined {
    if (!defaultSchema || !overrides) return defaultSchema;
    if (!defaultSchema.properties) return defaultSchema;

    const mergedProperties: Record<string, BlongSchemaProperty> = {};
    for (const [key, prop] of Object.entries(defaultSchema.properties)) {
        const override = overrides[key];
        mergedProperties[key] = override ? {...prop, ...override} : prop;
    }

    return {...defaultSchema, properties: mergedProperties};
}

/**
 * Merge card overrides into default cards.
 */
function mergeCards(
    defaultCards: Cards | undefined,
    overrides: Partial<Cards> | undefined,
): Cards | undefined {
    if (!defaultCards || !overrides) return defaultCards;

    const merged: Cards = {};
    for (const [key, card] of Object.entries(defaultCards)) {
        const override = overrides[key];
        merged[key] = override ? {...card, ...override} : card;
    }
    // Add any new cards from overrides
    for (const [key, card] of Object.entries(overrides)) {
        if (!merged[key] && card) {
            merged[key] = card as Cards[string];
        }
    }

    return merged;
}

/**
 * Merge layout overrides into default layouts.
 */
function mergeLayouts(
    defaultLayouts: Layouts | undefined,
    overrides: Partial<Layouts> | undefined,
): Layouts | undefined {
    if (!defaultLayouts || !overrides) return defaultLayouts;

    const merged: Layouts = {};
    for (const [key, layout] of Object.entries(defaultLayouts)) {
        const override = overrides[key];
        merged[key] = override ? {...layout, ...override} : layout;
    }
    for (const [key, layout] of Object.entries(overrides)) {
        if (!merged[key] && layout) {
            merged[key] = layout as Layouts[string];
        }
    }

    return merged;
}

/**
 * Hook to load and merge per-component customisations.
 *
 * @example
 * ```tsx
 * const { schema, cards, layouts, saveCustomization } = useCustomization({
 *     componentId: 'user.user',
 *     defaultSchema: methodSchema.request,
 *     defaultCards: myCards,
 *     defaultLayouts: myLayouts,
 * });
 * ```
 */
export function useCustomization(options: UseCustomizationOptions) {
    const {
        componentId,
        defaultSchema,
        defaultCards,
        defaultLayouts,
        enabled = true,
    } = options;

    const queryClient = useQueryClient();

    // Fetch persisted customisation
    const query = useQuery<Customisation | null>({
        queryKey: ['blong-customization', componentId],
        queryFn: () =>
            rpcCall<Customisation | null>('ui.customization.get', {componentId}),
        enabled: enabled && !!componentId,
        staleTime: 5 * 60 * 1000,
    });

    const customisation = query.data;

    // Merge defaults with overrides
    const schema = mergeSchema(defaultSchema, customisation?.schema);
    const cards = mergeCards(defaultCards, customisation?.cards);
    const layouts = mergeLayouts(defaultLayouts, customisation?.layouts);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (update: Omit<Customisation, 'componentId'>) =>
            rpcCall('ui.customization.edit', {
                component: {componentId, componentConfig: update},
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['blong-customization', componentId],
            });
        },
    });

    return {
        /** Merged schema (defaults + overrides). */
        schema,
        /** Merged cards (defaults + overrides). */
        cards,
        /** Merged layouts (defaults + overrides). */
        layouts,
        /** Raw customisation from the server. */
        customisation,
        /** Save customisation changes. */
        saveCustomization: saveMutation.mutate,
        /** Whether save is in progress. */
        isSaving: saveMutation.isPending,
        /** Whether customisation is loading. */
        isLoading: query.isLoading,
        /** The load error, if any. */
        error: query.error,
    };
}
