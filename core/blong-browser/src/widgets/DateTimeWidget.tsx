import {Calendar} from '../primereact/index.js';

import type {IWidgetProps} from '../types/widget.js';

export function DateTimeWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const dateValue = value instanceof Date ? value : value ? new Date(value as string) : null;
    return (
        <Calendar
            inputId={id ?? name}
            value={dateValue}
            onChange={e => onChange(e.value ?? null)}
            onHide={onBlur}
            readOnlyInput={readOnly}
            disabled={disabled}
            className={`blong-datetime w-full ${error ? 'p-invalid' : ''}`}
            showIcon
            showOnFocus={false}
            showTime
            showSeconds
        />
    );
}
