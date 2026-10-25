/**
 * The option lists a table needs before it can render a cell.
 *
 * A column that names a dropdown holds a key, and a key is not what a reader wants:
 * the cell shows the option's label. The caller may pass the options, and a model page
 * does not — so the missing ones are loaded through the portal orchestrator, the same
 * call a dropdown widget makes. A pivot's slot list is loaded the same way.
 *
 * The hook also reports what the rendered rows depend on: PrimeReact keeps a row as it
 * painted it, so options that arrive after the first paint would leave the stored id on
 * screen until something remounts the table. That is what the signature is for.
 */
import type {IDropdownOption} from '@feasibleone/blong';
import {useEffect, useMemo, useState} from 'react';
import {dropdownRegistry} from '../../model/dropdownRegistry.js';
import type {Row} from './model.js';

export interface ITableDropdownsOptions {
    /** The columns the table renders, and the schema they came from. */
    columns: string[];
    properties?: Record<string, {widget?: {dropdown?: string; body?: string}}>;
    /** The options the caller already has, by dropdown name. */
    dropdowns?: Record<string, unknown[]>;
    /** The dropdown naming a pivot's slots, when the table is a pivot. */
    pivotDropdown?: string;
    /** Loads the named lists — `handler.portalDropdownList`. */
    load?: (names: string[]) => Promise<Record<string, unknown>>;
}

export function useTableDropdowns({
    columns,
    properties,
    dropdowns,
    pivotDropdown,
    load,
}: ITableDropdownsOptions) {
    const columnDropdownKeys = useMemo(
        () =>
            columns
                .map(field => properties?.[field]?.widget?.dropdown)
                .filter((key): key is string => typeof key === 'string' && key.length > 0),
        [columns, properties],
    );

    const [loaded, setLoaded] = useState<Record<string, unknown[]>>({});
    useEffect(() => {
        const missing = columnDropdownKeys.filter(key => !dropdowns?.[key] && !loaded[key]);
        if (!missing.length || !load) return;
        let cancelled = false;
        Promise.all(
            missing.map(name =>
                load([name])
                    .then(
                        result => [name, Array.isArray(result[name]) ? result[name] : []] as const,
                    )
                    .catch(() => [name, []] as const),
            ),
        ).then(entries => {
            if (!cancelled) setLoaded(prev => ({...prev, ...Object.fromEntries(entries)}));
        });
        return () => {
            cancelled = true;
        };
    }, [columnDropdownKeys, dropdowns, loaded, load]);

    /** The caller's map wins; the loaded one fills the gaps. */
    const resolvedDropdowns = useMemo(() => ({...loaded, ...dropdowns}), [loaded, dropdowns]);

    /**
     * What the rendered rows depend on, beyond the data: how many options each label
     * column has. A table keyed on it remounts exactly once, when they arrive. @@D-612
     */
    const signature = columnDropdownKeys
        .map(key => `${key}:${resolvedDropdowns[key]?.length ?? 0}`)
        .join('|');

    /**
     * The label columns a list read should project instead of the keys: a row then
     * arrives with its names attached and no cell is resolved on the fly. @@D-614
     */
    const labelFields = useMemo(
        () =>
            columns
                .map(field => properties?.[field]?.widget?.body)
                .filter((field): field is string => typeof field === 'string'),
        [columns, properties],
    );

    // A pivot's slot rows come from a named dropdown, which the caller may not have
    // passed either.
    const [pivotOptions, setPivotOptions] = useState<Row[] | undefined>(undefined);
    useEffect(() => {
        if (!pivotDropdown || dropdowns?.[pivotDropdown] || !load) return;
        let cancelled = false;
        const loader = (name: string): Promise<IDropdownOption[]> =>
            load([name]).then(result => {
                const data = result[name];
                return (Array.isArray(data) ? data : []) as IDropdownOption[];
            });
        dropdownRegistry
            .get(pivotDropdown, loader)
            .then(data => {
                if (!cancelled) setPivotOptions(data as Row[]);
            })
            .catch(() => {
                // Error surfaced by the central dispatch wrapper; render without rows.
            });
        return () => {
            cancelled = true;
        };
    }, [pivotDropdown, dropdowns, load]);

    return {resolvedDropdowns, signature, labelFields, pivotOptions};
}
