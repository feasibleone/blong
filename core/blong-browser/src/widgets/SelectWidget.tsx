import {SelectButton} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';
import {useOptionLabel} from '../hooks/useText.js';

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
    // A static option label is a dictionary key like any other (`D-635`).
    const optionLabel = useOptionLabel();
    const translated = options.map(o => ({...o, label: optionLabel(o)}));
    return (
        <div
            id={id ?? name}
            data-testid={id ?? name}
            className="blong-select-wrapper"
        >
            <SelectButton
                value={value}
                options={translated}
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
