import {SelectButton} from 'primereact/selectbutton';
import type {IWidgetProps} from '../types/widget.js';

export function SelectWidget({
    name: _name,
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
    );
}
