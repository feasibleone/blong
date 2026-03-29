/**
 * useLayout — layout state resolution.
 *
 * Resolves the active layout based on the current form mode (create/edit),
 * optional type field value (for polymorphic layouts), and falls back
 * through the layout hierarchy.
 */

import {useMemo} from 'react';

import type {FormMode, Layout, Layouts} from '../types.js';

/** Options for the useLayout hook. */
export interface UseLayoutOptions {
    /** Available layouts. */
    layouts?: Layouts;
    /** Current form mode. */
    mode: FormMode;
    /** Type field value for polymorphic layout selection. */
    typeValue?: string;
}

/**
 * Resolve the active layout by trying keys in priority order:
 * 1. `{mode}{TypeValue}` (e.g. `editTransfer`)
 * 2. `{mode}Default` (e.g. `editDefault`)
 * 3. `{mode}` (e.g. `edit`)
 * 4. If mode is `create`, fall back to the edit chain
 * 5. `default`
 */
export function resolveLayout(
    layouts: Layouts | undefined,
    mode: FormMode,
    typeValue?: string,
): Layout | undefined {
    if (!layouts) return undefined;

    const candidates: string[] = [];

    // Mode + type value
    if (typeValue) {
        const capitalized = typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
        candidates.push(`${mode}${capitalized}`);
    }

    // Mode + Default
    candidates.push(`${mode}Default`);
    candidates.push(mode);

    // Create falls back to edit
    if (mode === 'create') {
        if (typeValue) {
            const capitalized = typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
            candidates.push(`edit${capitalized}`);
        }
        candidates.push('editDefault');
        candidates.push('edit');
    }

    candidates.push('default');

    for (const key of candidates) {
        if (layouts[key]) return layouts[key];
    }

    return undefined;
}

/**
 * Hook to resolve the active layout from a layouts map.
 *
 * @example
 * ```tsx
 * const { layout, layoutKey } = useLayout({
 *     layouts: myLayouts,
 *     mode: 'edit',
 *     typeValue: record?.type,
 * });
 * ```
 */
export function useLayout(options: UseLayoutOptions) {
    const {layouts, mode, typeValue} = options;

    const result = useMemo(() => {
        if (!layouts) return {layout: undefined, layoutKey: undefined};

        const candidates: string[] = [];

        if (typeValue) {
            const capitalized = typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
            candidates.push(`${mode}${capitalized}`);
        }
        candidates.push(`${mode}Default`);
        candidates.push(mode);

        if (mode === 'create') {
            if (typeValue) {
                const capitalized = typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
                candidates.push(`edit${capitalized}`);
            }
            candidates.push('editDefault');
            candidates.push('edit');
        }
        candidates.push('default');

        for (const key of candidates) {
            if (layouts[key]) return {layout: layouts[key], layoutKey: key};
        }

        return {layout: undefined, layoutKey: undefined};
    }, [layouts, mode, typeValue]);

    return result;
}
