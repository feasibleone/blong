import {InputMask} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function MaskWidget({
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
    const mask = schema.widget?.mask ?? '999.999.999.999';
    return (
        <InputMask
            id={id ?? name}
            name={name}
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            className={`blong-mask w-full ${error ? 'p-invalid' : ''}`}
            mask={mask}
        />
    );
}
