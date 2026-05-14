import React from 'react';
import {Calendar} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

const timeIn = (d: string | Date) => {
    const dd = new Date(d);
    const properDate = new Date(
        new Date(d).getTime() + new Date(d).getTimezoneOffset() * 60 * 1000,
    );
    const timezoneDiff = properDate.getTimezoneOffset() - dd.getTimezoneOffset();
    if (!timezoneDiff) return properDate;
    return new Date(properDate.getTime() + timezoneDiff * 60 * 1000);
};

const timeOut = (d: Date) => new Date(d.setFullYear(1970, 0, 1));

export function TimeWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const dateValue = value instanceof Date ? value : value ? timeIn(value as string) : null;

    const handleChange = React.useMemo(
        () => (event: {value: Date | null | undefined | string | Date[]}) => {
            if (event.value instanceof Date) event.value = timeOut(event.value);
            onChange(event.value);
        },
        [onChange],
    );

    return (
        <Calendar
            inputId={id ?? name}
            value={dateValue}
            onChange={handleChange}
            onHide={onBlur}
            readOnlyInput={readOnly}
            disabled={disabled}
            className={`blong-time w-full ${error ? 'p-invalid' : ''}`}
            showIcon
            showOnFocus={false}
            timeOnly
        />
    );
}
