import {InputNumber} from '../primereact/index.js';

import type {IWidgetProps} from '../types/widget.js';

export function IntegerWidget({
    id,
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
            inputId={id ?? name}
            name={name}
            value={value == null ? null : Number(value)}
            onValueChange={e => onChange(e.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-integer w-full ${error ? 'p-invalid' : ''}`}
            inputClassName="w-full text-right"
            showButtons
            min={schema.minimum}
            max={schema.maximum}
        />
    );
}
