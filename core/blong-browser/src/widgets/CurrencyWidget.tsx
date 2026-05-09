import {InputNumber} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function CurrencyWidget({
    id,
    name,
    schema: _schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    return (
        <InputNumber
            inputId={id ?? name}
            name={name}
            value={value == null ? null : Number(value)}
            onValueChange={e => onChange(e.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-currency w-full ${error ? 'p-invalid' : ''}`}
            inputClassName="text-right"
            minFractionDigits={2}
            maxFractionDigits={2}
        />
    );
}
