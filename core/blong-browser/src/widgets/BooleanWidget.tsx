import {Checkbox} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function BooleanWidget({
    id,
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
            inputId={id ?? name}
            checked={Boolean(value)}
            onChange={e => onChange(e.checked)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className="blong-boolean"
        />
    );
}
