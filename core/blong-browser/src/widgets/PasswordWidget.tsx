import {Password} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function PasswordWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    return (
        <Password
            inputId={id ?? name}
            name={name}
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value || null)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-password w-full ${error ? 'p-invalid' : ''}`}
            toggleMask
            role="textbox"
            inputClassName="w-full"
        />
    );
}
