import type {IWidgetProps} from '@feasibleone/blong';

const INTEGER_RE = /^-?\d+$/;

/**
 * BigIntWidget — numeric input for large integers (e.g. `bigint` columns).
 *
 * NumberWidget/IntegerWidget build on PrimeReact InputNumber, which is
 * JS-number based and silently rounds integers beyond Number.MAX_SAFE_INTEGER
 * (2^53−1).  This widget keeps the raw text in local state so 64-bit values
 * are not corrupted, and on change it emits:
 *  - a JS `number` when the value is within the safe range — so strict
 *    integer validation and existing consumers keep working; or
 *  - the raw `string` otherwise — preserving full bigint precision.
 *
 * The `bigInt*` schema types accept both forms (BigInt, Integer, or an
 * integer string), and the database column coerces the string back to bigint.
 */
export function BigIntWidget({
    id,
    name,
    value,
    onChange,
    onBlur,
    error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const handleChange = (raw: string) => {
        const trimmed = raw.trim();
        if (trimmed === '') {
            onChange(null);
            return;
        }
        if (!INTEGER_RE.test(trimmed)) return; // incomplete/invalid — do not emit
        const num = Number(trimmed);
        onChange(Number.isSafeInteger(num) ? num : trimmed);
    };

    return (
        <input
            id={id ?? name}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={`blong-bigint w-full p-inputtext p-component${error ? ' p-invalid' : ''}`}
            value={value == null ? '' : String(value)}
            onChange={e => handleChange(e.target.value)}
            onBlur={onBlur}
            readOnly={readOnly}
            disabled={disabled}
        />
    );
}
