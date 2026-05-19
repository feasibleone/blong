import {MultiSelect} from '../primereact/index.js';

import type {IDropdownOption, IWidgetProps} from '@feasibleone/blong';
import {useEffect, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {dropdownRegistry} from '../model/dropdownRegistry.js';

type SelectOption = IDropdownOption;

function toOptions(data: unknown): SelectOption[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => ({
        label: String(item.label ?? item.name ?? item.value ?? item),
        value: item.value ?? item,
    }));
}

export function MultiSelectWidget({
    id,
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {
        fetch: fetchAction,
        options: staticOptions,
        dropdown: dropdownKey,
        type: widgetType,
    } = schema.widget ?? {};
    const {dispatch} = useBlongUi();
    const [options, setOptions] = useState<SelectOption[]>(
        () => staticOptions ? toOptions(staticOptions) : [],
    );

    useEffect(() => {
        let cancelled = false;
        if (staticOptions) return;

        // Priority 1: named dropdown via portal orchestrator (batched + cached)
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
                    // Error surfaced by the central dispatch wrapper in BlongUiProvider.
                });
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
    }, [fetchAction, dropdownKey, dispatch, staticOptions]);

    const arrValue: unknown[] = Array.isArray(value) ? value : value != null ? [value] : [];

    // multiSelectPanel: render as inline checkbox panel
    // (inline + flex + itemClassName='col-3' → 4-column grid of checkboxes)
    const isPanel = widgetType === 'multiSelectPanel';

    if (readOnly && !isPanel) {
        // Regular multi-select in read-only: show comma-separated labels
        const labels = arrValue.map(v => options.find(o => o.value === v)?.label ?? String(v));
        return <span className="blong-display">{labels.join(', ')}</span>;
    }

    return (
        <MultiSelect
            inputId={id ?? name}
            data-testid={id ?? name}
            value={arrValue}
            options={options}
            onChange={readOnly ? undefined : e => onChange(e.value)}
            onHide={isPanel || readOnly ? undefined : onBlur}
            disabled={disabled || readOnly}
            className={`blong-multiselect w-full ${error ? 'p-invalid' : ''}`}
            display="chip"
            filter={!isPanel && options.length > 8}
            placeholder={schema.placeholder ?? 'Select…'}
            {...(isPanel
                ? {
                      inline: true,
                      flex: true,
                      itemClassName: 'col-3',
                  }
                : {})}
        />
    );
}
