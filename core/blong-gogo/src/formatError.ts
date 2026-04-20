/**
 * Builds a field-filtered error formatter.
 *
 * `errorFields` is an array of `[key, rule]` tuples:
 *  - `true`    → copy the value as-is
 *  - `'error'` → recurse into a nested Error
 */
export function createErrorFormatter(
    errorFields: [string, unknown][],
): (error: Error) => object {
    const format = (error: Error): object =>
        errorFields.reduce((e, [key, value]) => {
            if (value && typeof error[key] !== 'undefined') {
                switch (value) {
                    case true:
                        e[key] = error[key];
                        break;
                    case 'error':
                        e[key] = format(error[key]);
                        break;
                    default:
                        break;
                }
            }
            return e;
        }, {});
    return format;
}
