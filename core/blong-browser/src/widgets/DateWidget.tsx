import {Calendar} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';
import React from 'react';

export const dateIn = (d: string | Date) => {
    const dd = new Date(d);
    const properDate = new Date(
        new Date(d).getTime() + new Date(d).getTimezoneOffset() * 60 * 1000,
    );
    const timezoneDiff = properDate.getTimezoneOffset() - dd.getTimezoneOffset();
    if (!timezoneDiff) return properDate;
    return new Date(properDate.getTime() + timezoneDiff * 60 * 1000);
};

export const dateOut = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000);

export function DateWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const dateValue = value != null ? dateIn(value as string) : null;

    const handleChange = React.useMemo(
        () => (event: {value: Date | null | undefined | string | Date[]}) => {
            if (event.value instanceof Date) event.value = dateOut(event.value);
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
            disabled={disabled || readOnly}
            className={`blong-date w-full ${error ? 'p-invalid' : ''}`}
            showIcon
            showOnFocus={false}
        />
    );
}
