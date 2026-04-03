import {InputMask} from 'primereact/inputmask';
import type {IWidgetProps} from '../types/widget.js';

export function MaskWidget({
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const mask = schema.widget?.mask ?? '999.999.999.999';
    return (
        <InputMask
            id={name}
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-mask ${error ? 'p-invalid' : ''}`}
            mask={mask}
        />
    );
}
