import {Button} from 'primereact/button';
import {InputText} from 'primereact/inputtext';
import type {IWidgetProps} from '../types/widget.js';

export function TextWidget({
    name,
    schema,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const strValue = value == null ? '' : String(value);
    const {copy} = schema.widget ?? {};

    const copyToClipboard = () => void navigator.clipboard.writeText(strValue);

    return (
        <span className="blong-input-wrapper w-full">
            <InputText
                id={name}
                name={name}
                value={strValue}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
                readOnly={readOnly}
                disabled={disabled}
                className={`blong-input w-full ${error ? 'p-invalid' : ''}`}
                maxLength={schema.maxLength}
            />
            {copy && strValue && (
                <Button
                    icon="pi pi-copy"
                    className="p-button-text p-button-sm blong-input-copy"
                    onClick={copyToClipboard}
                    type="button"
                    tooltip="Copy"
                />
            )}
        </span>
    );
}
