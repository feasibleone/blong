import {InputNumber} from 'primereact/inputnumber';
import type {IWidgetProps} from '../types/widget.js';

export function NumberWidget({
    name,
    schema,
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
            className={`blong-number ${error ? 'p-invalid' : ''}`}
            min={schema.minimum}
            max={schema.maximum}
            useGrouping
        />
    );
}
