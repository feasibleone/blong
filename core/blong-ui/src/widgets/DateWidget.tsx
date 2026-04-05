import type { IWidgetProps } from '../types/widget.js';

export function DateWidget({
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    // Normalise to ISO yyyy-mm-dd string — the canonical storage format for format:'date'
    const isoValue =
        value instanceof Date
            ? value.toISOString().slice(0, 10)
            : typeof value === 'string'
              ? value.slice(0, 10)
              : '';

    if (readOnly) {
        return <span className="blong-display">{isoValue}</span>;
    }

    return (
        <input
            type="date"
            id={name}
            value={isoValue}
            onChange={e => onChange(e.target.value || null)}
            onBlur={onBlur}
            disabled={disabled}
            className={`p-inputtext p-component w-full blong-date${error ? ' p-invalid' : ''}`}
        />
    );
}
