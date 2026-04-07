import {Calendar} from 'primereact/calendar';
import type {IWidgetProps} from '../types/widget.js';

export function TimeWidget({
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
            inputId={name}
            value={dateValue}
            onChange={e => onChange(e.value ?? null)}
            onHide={onBlur}
            readOnlyInput={readOnly}
            disabled={disabled}
            className={`blong-time ${error ? 'p-invalid' : ''}`}
            showIcon
            timeOnly
            hourFormat="24"
        />
    );
}
