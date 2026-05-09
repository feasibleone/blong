import {SelectButton} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

export function SelectWidget({
    id,
    name,
    schema,
    value,
    onChange,
    onBlur,
    error: _error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {options = []} = schema.widget ?? {};
    return (
        <div
            id={id ?? name}
            data-testid={id ?? name}
            className="blong-select-wrapper"
        >
            <SelectButton
                value={value}
                options={options}
                onChange={e => {
                    onChange(e.value);
                    onBlur();
                }}
                disabled={disabled || readOnly}
                className="blong-select"
            />
        </div>
    );
}
