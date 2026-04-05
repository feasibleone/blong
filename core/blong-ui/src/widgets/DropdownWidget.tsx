import {Dropdown} from 'primereact/dropdown';
import {useEffect, useRef, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import type {IDropdownOption} from '../model/types.js';
import type {IWidgetProps} from '../types/widget.js';

type SelectOption = IDropdownOption;

function toOptions(data: unknown): SelectOption[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => ({
        ...item, // preserve extra properties (e.g., parent field keys for cascade filtering)
        label: String(item.label ?? item.name ?? item.value ?? item),
        value: item.value ?? item,
    }));
}

export function DropdownWidget({
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
    formValues,
}: IWidgetProps) {
    const {
        fetch: fetchAction,
        options: staticOptions,
        dropdown: dropdownKey,
        parent,
    } = schema.widget ?? {};
    const {dispatch} = useBlongUi();
    const parentValue = parent ? formValues?.[parent] : undefined;
    const [options, setOptions] = useState<SelectOption[]>(
        staticOptions ? toOptions(staticOptions) : [],
    );

    // Clear this widget's value when the parent selection changes
    const prevParentValueRef = useRef<unknown>(parentValue);
    useEffect(() => {
        if (parent === undefined) return;
        if (prevParentValueRef.current !== parentValue) {
            prevParentValueRef.current = parentValue;
            if (value !== undefined && value !== null) onChange(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentValue]);

    useEffect(() => {
        let cancelled = false;

        // Skip async load when static options are already provided
        if (staticOptions) return;

        // Priority 1: named dropdown via portal orchestrator (handles batching + caching)
        if (dropdownKey) {
            const loader = (key: string) =>
                (
                    dispatch('portal.dropdown.list', {names: [key]}) as Promise<
                        Record<string, unknown>
                    >
                ).then(result => toOptions(result[key]));

            dropdownRegistry
                .get(dropdownKey, loader)
                .then(data => {
                    if (!cancelled) setOptions(data);
                })
                .catch(() => {
                    // Error already surfaced by the central dispatch wrapper in
                    // BlongUiProvider. Widget renders with empty options.
                });

            return () => {
                cancelled = true;
            };
        }

        // Priority 2: explicit fetch action (re-fetch when parent value changes)
        if (!fetchAction) return;
        const params: Record<string, unknown> = {};
        if (parent && parentValue !== undefined) params[parent] = parentValue;
        (dispatch(fetchAction, params) as Promise<unknown>)
            .then(data => {
                if (!cancelled) setOptions(toOptions(data));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fetchAction, dropdownKey, dispatch, parentValue]);

    // Filter options by parent value (client-side cascade).
    // Supports both named-key format ({continent: 1}) and generic parent key ({parent: 1}).
    const visibleOptions =
        parent && parentValue !== undefined
            ? options.filter(o => {
                  const opt = o as unknown as Record<string, unknown>;
                  return opt[parent] === parentValue || opt['parent'] === parentValue;
              })
            : options;

    if (readOnly) {
        const found = visibleOptions.find(o => o.value === value);
        return (
            <span className="blong-display">
                {found?.label ?? (value != null ? String(value) : '')}
            </span>
        );
    }

    const isParentEmpty = !!parent && (parentValue === undefined || parentValue === null);

    return (
        <Dropdown
            inputId={name}
            value={value}
            options={visibleOptions}
            onChange={e => onChange(e.value)}
            onHide={onBlur}
            disabled={disabled || isParentEmpty}
            className={`blong-dropdown w-full ${error ? 'p-invalid' : ''}`}
            showClear={!schema.required}
            filter={visibleOptions.length > 8}
            placeholder={schema.placeholder ?? 'Select…'}
            dropdownIcon="pi pi-chevron-down"
        />
    );
}
