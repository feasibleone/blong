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
    const {fetch: fetchAction, options: staticOptions} = schema.widget ?? {};
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
    }, [fetchAction, call]);

    const arrValue: unknown[] = Array.isArray(value) ? value : value != null ? [value] : [];

    if (readOnly) {
        const labels = arrValue.map(v => options.find(o => o.value === v)?.label ?? String(v));
        return <span className="blong-display">{labels.join(', ')}</span>;
    }

    return (
        <MultiSelect
            inputId={name}
            value={arrValue}
            options={options}
            onChange={e => onChange(e.value)}
            onHide={onBlur}
            disabled={disabled}
            className={`blong-multiselect ${error ? 'p-invalid' : ''}`}
            display="chip"
            filter={options.length > 8}
            placeholder={schema.placeholder ?? 'Select…'}
        />
    );
}
