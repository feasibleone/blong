import {Chips} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function ChipsWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const chipsValue: string[] = typeof value === 'string' ? value.split(' ').filter(Boolean) : [];

    return (
        <Chips
            inputId={id ?? name}
            value={chipsValue}
            onChange={e =>
                onChange(Array.isArray(e.value) && e.value.length ? e.value.join(' ') : null)
            }
            onBlur={onBlur}
            disabled={disabled || readOnly}
            className={`blong-chips w-full ${error ? 'p-invalid' : ''}`}
        />
    );
}
