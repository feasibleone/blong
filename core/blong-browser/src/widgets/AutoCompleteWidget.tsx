import {AutoComplete} from '../primereact/index.js';

import type {IWidgetProps} from '@feasibleone/blong';

/**
 * AutoCompleteWidget — wraps PrimeReact AutoComplete.
 *
 * The widget value is an object `{value: string | null, suggestions: string[]}`.
 * Suggestion population is driven by the host form via onChange events.
 */
export function AutoCompleteWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const val = value as {value?: string | null; suggestions?: string[]} | null | undefined;

    return (
        <AutoComplete
            inputId={id ?? name}
            value={val?.value ?? ''}
            suggestions={val?.suggestions ?? []}
            completeMethod={e =>
                onChange({value: val?.value ?? null, suggestions: [], query: e.query})
            }
            onSelect={e => onChange({...e, value: e.value})}
            onChange={e => onChange({value: e.value || null, suggestions: val?.suggestions ?? []})}
            onClear={() => onChange({value: null, suggestions: []})}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
            inputClassName="w-full"
            className={`blong-autocomplete w-full ${error ? 'p-invalid' : ''}`}
        />
    );
}
