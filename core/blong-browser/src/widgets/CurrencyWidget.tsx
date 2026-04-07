import {InputNumber} from 'primereact/inputnumber';
import type {IWidgetProps} from '../types/widget.js';

export function CurrencyWidget({
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
            inputId={name}
            value={value == null ? null : Number(value)}
            onValueChange={e => onChange(e.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-currency ${error ? 'p-invalid' : ''}`}
            mode="decimal"
            minFractionDigits={2}
            maxFractionDigits={2}
            useGrouping
        />
    );
}
