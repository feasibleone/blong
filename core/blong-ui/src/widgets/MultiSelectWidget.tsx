import {MultiSelect} from 'primereact/multiselect';
import {useEffect, useState} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import type {IWidgetProps} from '../types/widget.js';

interface SelectOption {
    label: string;
    value: unknown;
}

function toOptions(data: unknown): SelectOption[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: Record<string, unknown>) => ({
        label: String(item.label ?? item.name ?? item.value ?? item),
        value: item.value ?? item,
    }));
}

export function MultiSelectWidget({
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {fetch: fetchAction, options: staticOptions, type: widgetType} = schema.widget ?? {};
    const {dispatch} = useBlongUi();
    const [options, setOptions] = useState<SelectOption[]>(
        staticOptions ? toOptions(staticOptions) : [],
    );

    useEffect(() => {
        if (!fetchAction) return;
        let cancelled = false;
        (dispatch(fetchAction, {}) as Promise<unknown>)
            .then(data => {
                if (!cancelled) setOptions(toOptions(data));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fetchAction, dispatch]);

    const arrValue: unknown[] = Array.isArray(value) ? value : value != null ? [value] : [];

    if (readOnly) {
        const labels = arrValue.map(v => options.find(o => o.value === v)?.label ?? String(v));
        return <span className="blong-display">{labels.join(', ')}</span>;
    }

    // multiSelectPanel: render as inline checkbox panel
    // (inline + flex + itemClassName='col-3' → 4-column grid of checkboxes)
    const isPanel = widgetType === 'multiSelectPanel';

    return (
        <MultiSelect
            inputId={name}
            value={arrValue}
            options={options}
            onChange={e => onChange(e.value)}
            onHide={isPanel ? undefined : onBlur}
            disabled={disabled}
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
