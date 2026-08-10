/**
 * JSON-column interception for the knex adapter.
 *
 * Any column whose name ends with `JSON` is treated as a JSON document stored
 * in a plain string column.  The shared `srv.db` queryBuilder is wrapped so
 * this conversion is automatic for every consumer of the adapter:
 *
 *  - `insert()` / `update()` — plain object/array values for `*JSON` columns
 *    are serialized with `JSON.stringify` before hitting the database.
 *  - query results (`select`, `first`, ...) — string values in `*JSON`
 *    columns are parsed back with `JSON.parse` (lenient: values that are not
 *    valid JSON are left untouched).
 *
 * This lets a realm store structured parameters in a single column without
 * manual (de)serialization — e.g. blong-access stores the credential function
 * and its parameters (`{"function":"hash","algorithm":"pbkdf2",...}`) in
 * `access_credential.credentialParamsJSON`.
 */

/** Column names ending in `JSON` are treated as JSON documents. */
const JSON_COLUMN = /JSON$/;

/** Whether a column name is a JSON column (ends in `JSON`). */
export function isJsonColumn(column: string): boolean {
    return JSON_COLUMN.test(column);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serialize object/array values of `*JSON` columns to JSON strings.
 * Returns a new object; scalar/string values are copied unchanged.
 */
export function stringifyJsonValues(values: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        result[key] =
            JSON_COLUMN.test(key) && (isRecord(value) || Array.isArray(value))
                ? JSON.stringify(value)
                : value;
    }
    return result;
}

/** Parse `*JSON` string values in a single result row.  Mutates and returns the row. */
export function parseJsonRow(row: Record<string, unknown>): Record<string, unknown> {
    for (const [key, value] of Object.entries(row)) {
        if (JSON_COLUMN.test(key) && typeof value === 'string') {
            try {
                row[key] = JSON.parse(value);
            } catch {
                // Not valid JSON — keep the raw string.
            }
        }
    }
    return row;
}

/**
 * Parse `*JSON` columns in a query result.  Handles a single row, an array of
 * rows, and the `[rows, meta]` shape MySQL returns for DML.  Rows are mutated
 * in place; the overall result shape is preserved.
 */
export function parseJsonResult(result: unknown): unknown {
    if (Array.isArray(result)) {
        return result.map(row => (isRecord(row) ? parseJsonRow(row) : row));
    }
    if (isRecord(result)) return parseJsonRow(result);
    return result;
}

/**
 * Wrap a knex QueryBuilder instance so JSON columns are serialized on write and
 * parsed on read.
 *
 * Only `insert`, `update`, and `then` are intercepted — all other builder
 * behaviour is untouched.  Chained calls keep working because knex builder
 * methods return the same instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapJsonBuilder(builder: any): any {
    const originalInsert = builder.insert.bind(builder);
    builder.insert = (...args: unknown[]) => {
        const [first, ...rest] = args;
        if (isRecord(first)) return originalInsert(stringifyJsonValues(first), ...rest);
        if (Array.isArray(first))
            return originalInsert(
                first.map(row => (isRecord(row) ? stringifyJsonValues(row) : row)),
                ...rest,
            );
        return originalInsert(...args);
    };

    const originalUpdate = builder.update.bind(builder);
    builder.update = (...args: unknown[]) => {
        const [first, ...rest] = args;
        if (isRecord(first)) return originalUpdate(stringifyJsonValues(first), ...rest);
        return originalUpdate(...args);
    };

    const originalThen = builder.then.bind(builder);
    builder.then = (
        onFulfilled?: ((value: unknown) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
    ) =>
        originalThen(
            (result: unknown) => {
                const processed = parseJsonResult(result);
                return typeof onFulfilled === 'function' ? onFulfilled(processed) : processed;
            },
            onRejected as ((reason: unknown) => unknown) | undefined,
        );

    return builder;
}

/**
 * Wrap the shared knex instance so every QueryBuilder produced by calling it
 * (e.g. `knex('access_credential')`) is JSON-column aware.  All other knex
 * surface (`.schema`, `.raw`, `.fn`, `.client`, ...) is left untouched via the
 * default Proxy get behaviour.
 *
 * The parameter is intentionally unconstrained: the installed `knex` types and
 * the `Knex` re-exported by `@feasibleone/blong` are structurally different, so
 * callers cast the result with `as unknown as Knex`.
 */
export function wrapKnex<T>(knex: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(knex as any, {
        apply(target, thisArg, args) {
            return wrapJsonBuilder(Reflect.apply(target, thisArg, args));
        },
    });
}
