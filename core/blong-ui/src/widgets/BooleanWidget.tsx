import {Checkbox} from 'primereact/checkbox';
import type {IWidgetProps} from '../types/widget.js';

export function BooleanWidget({
    name,
    value,
    onChange,
    onBlur,
    error: _error,
    readOnly,
    disabled,
}: IWidgetProps) {
    return (
        <Checkbox
            inputId={name}
            checked={Boolean(value)}
            onChange={e => onChange(e.checked)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className="blong-boolean"
        />
    );
}
