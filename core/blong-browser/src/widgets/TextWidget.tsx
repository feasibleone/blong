import {InputText} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';
import {Button} from '../components/Button/Button.js';

export function TextWidget({
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
    const strValue = value == null ? '' : String(value);
    const {copy} = schema.widget ?? {};

    const copyToClipboard = () => void navigator.clipboard.writeText(strValue);

    return (
        <span className="blong-input-wrapper w-full">
            <InputText
                id={id ?? name}
                name={name}
                value={strValue}
                onChange={e => onChange(e.target.value || null)}
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
