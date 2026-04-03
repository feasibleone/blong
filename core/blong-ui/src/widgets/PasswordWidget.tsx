import {Password} from 'primereact/password';
import type {IWidgetProps} from '../types/widget.js';

export function PasswordWidget({
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
            inputId={name}
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-password ${error ? 'p-invalid' : ''}`}
            feedback={false}
            toggleMask
        />
    );
}
