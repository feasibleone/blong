import {InputTextarea} from 'primereact/inputtextarea';
import type {IWidgetProps} from '../types/widget.js';

export function TextareaWidget({
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
            id={name}
            name={name}
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-textarea ${error ? 'p-invalid' : ''}`}
            autoResize
            rows={3}
            maxLength={schema.maxLength}
        />
    );
}
