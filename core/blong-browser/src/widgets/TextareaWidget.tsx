import {InputTextarea} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function TextareaWidget({
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
        <InputTextarea
            id={id ?? name}
            name={name}
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value || null)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-textarea w-full ${error ? 'p-invalid' : ''}`}
            autoResize
            rows={3}
            maxLength={schema.maxLength}
        />
    );
}
