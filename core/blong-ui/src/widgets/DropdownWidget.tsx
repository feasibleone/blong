import {Dropdown} from 'primereact/dropdown';
import {useEffect, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';
import type {IDropdownOption} from '../model/types.js';
import type {IWidgetProps} from '../types/widget.js';

type SelectOption = IDropdownOption;

function toOptions(data: unknown): SelectOption[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => ({
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
}: IWidgetProps) {
    const {fetch: fetchAction, options: staticOptions, dropdown: dropdownKey} = schema.widget ?? {};
    const {dispatch} = useBlongUi();
    const [options, setOptions] = useState<SelectOption[]>(
        staticOptions ? toOptions(staticOptions) : [],
    );

    useEffect(() => {
        let cancelled = false;

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
                .catch(() => {});

            return () => {
                cancelled = true;
            };
        }

        // Priority 2: explicit fetch action
        if (!fetchAction) return;
        (dispatch(fetchAction, {}) as Promise<unknown>)
            .then(data => {
                if (!cancelled) setOptions(toOptions(data));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fetchAction, dropdownKey, dispatch]);

    if (readOnly) {
        const found = options.find(o => o.value === value);
        return (
            <span className="blong-display">
                {found?.label ?? (value != null ? String(value) : '')}
            </span>
        );
    }

    return (
        <Dropdown
            inputId={name}
            value={value}
            options={options}
            onChange={e => onChange(e.value)}
            onHide={onBlur}
            disabled={disabled}
            className={`blong-dropdown ${error ? 'p-invalid' : ''}`}
            showClear={!schema.required}
            filter={options.length > 8}
            placeholder={schema.placeholder ?? 'Select…'}
        />
    );
}
