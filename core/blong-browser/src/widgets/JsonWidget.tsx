import {InputTextarea} from 'primereact/inputtextarea';
import {useState} from 'react';
import {Button} from '../components/Button/index.js';
import type {IWidgetProps} from '../types/widget.js';

export function JsonWidget({
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const serialized =
        value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const [parseError, setParseError] = useState<string | null>(null);
    const [raw, setRaw] = useState(serialized);

    const handleChange = (text: string) => {
        setRaw(text);
        try {
            onChange(JSON.parse(text));
            setParseError(null);
        } catch {
            setParseError('Invalid JSON');
        }
    };

    const format = () => {
        try {
            const parsed = JSON.parse(raw);
            const pretty = JSON.stringify(parsed, null, 2);
            setRaw(pretty);
            setParseError(null);
        } catch {
            setParseError('Invalid JSON');
        }
    };

    return (
        <div className="blong-json-widget">
            <InputTextarea
                id={name}
                value={raw}
                onChange={e => handleChange(e.target.value)}
                onBlur={onBlur}
                readOnly={readOnly}
                disabled={disabled}
                className={`blong-json-input ${error || parseError ? 'p-invalid' : ''}`}
                rows={6}
                autoResize
            />
            {!readOnly && !disabled && (
                <Button
                    icon="pi pi-align-left"
                    className="p-button-text p-button-sm blong-json-format"
                    onClick={format}
                    type="button"
                    tooltip="Format JSON"
                />
            )}
            {parseError && <small className="p-error">{parseError}</small>}
        </div>
    );
}
