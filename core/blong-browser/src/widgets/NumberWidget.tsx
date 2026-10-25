import {InputNumber} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function NumberWidget({
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
            className={`blong-number w-full ${error ? 'p-invalid' : ''}`}
            inputClassName="text-right"
            min={schema.minimum}
            max={schema.maximum}
            // A number is an amount far more often than a year, so its thousands
            // separator stays the default; a field that holds an identifier says so
            // with `widget.useGrouping: false`. @@D-613
            useGrouping={schema.widget?.useGrouping !== false}
        />
    );
}
