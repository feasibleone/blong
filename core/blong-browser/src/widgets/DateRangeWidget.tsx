import type {IWidgetProps} from '@feasibleone/blong';
import {DateRange} from '../components/DateRange/DateRange.js';

/**
 * DateRangeWidget — wraps the DateRange component.
 *
 * Form storage: `[Date, Date]` array (or null/undefined).
 * Component interface: JSON string "[from, to]" → onChange fires `{value: [Date, Date]}`.
 */
export function DateRangeWidget({
    name: _name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {exclusive, timeOnly} = schema.widget ?? {};

    // Normalise stored value to the JSON string the DateRange component expects
    let strValue: string | null = null;
    if (Array.isArray(value) && value.length === 2) {
        strValue = JSON.stringify(value);
    } else if (typeof value === 'string') {
        strValue = value;
    }

    return (
        <DateRange
            value={strValue}
            onChange={e => onChange(e.value)}
            exclusive={Boolean(exclusive)}
            timeOnly={Boolean(timeOnly)}
            disabled={disabled || readOnly}
        />
    );
}
