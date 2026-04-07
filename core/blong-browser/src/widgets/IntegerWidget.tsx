import {InputNumber} from 'primereact/inputnumber';
import type {IWidgetProps} from '../types/widget.js';

export function IntegerWidget({
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
            className={`blong-integer ${error ? 'p-invalid' : ''}`}
            showButtons
            step={1}
            min={schema.minimum}
            max={schema.maximum}
        />
    );
}
