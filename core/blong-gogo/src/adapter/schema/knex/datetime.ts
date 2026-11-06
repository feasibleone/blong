/**
 * Date column utilities for the knex adapter.
 *
 * A form sends what the browser's datepicker produces — an ISO 8601 string with a
 * `Z` (`2015-01-01T00:00:00.000Z`) — and MySQL rejects it for a `DATE` column
 * (`Incorrect datetime value`).  TypeBox codecs turn such a string into a `Date`
 * only when the request passes a typed schema; a handler that overrides its
 * validation with a permissive payload (a flat profile, a payload with a derived
 * field) hands the string straight to knex.
 *
 * The adapter therefore normalises at the database boundary: it discovers the
 * `date` / `datetime` / `timestamp` columns from INFORMATION_SCHEMA (the same way
 * `binary.ts` discovers `binary(16)`) and rewrites any value bound for them into
 * the format MySQL parses.  The semantics follow the schema codecs in
 * `@feasibleone/blong-lib`: a `date` column stores the calendar day, a `datetime`
 * stores the instant in UTC with no zone suffix.
 *
 * @@F-697 records the ISO-into-MySQL failure this closes, and @@D-785 the
 * decision to normalise here rather than in a realm's handler.
 */
import {type Knex} from '@feasibleone/blong';

/** What MySQL accepts for one column family. */
export type TDateKind = 'date' | 'datetime';

/** table → column → kind. */
export type DateColumnMap = Map<string, Map<string, TDateKind>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Discover `date` / `datetime` / `timestamp` columns from INFORMATION_SCHEMA.
 *
 * Call this once during adapter `ready()`, after the schema has been synced, and
 * store the result on `this.config.context.dateColumns`.
 */
export async function discoverDateColumns(knex: Knex): Promise<DateColumnMap> {
    const rows: Array<{TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string}> = await knex
        .from('INFORMATION_SCHEMA.COLUMNS')
        .whereIn('DATA_TYPE', ['date', 'datetime', 'timestamp'])
        .select('TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE');
    const map: DateColumnMap = new Map();
    for (const row of rows) {
        const kind: TDateKind = row.DATA_TYPE.toLowerCase() === 'date' ? 'date' : 'datetime';
        if (!map.has(row.TABLE_NAME)) map.set(row.TABLE_NAME, new Map());
        map.get(row.TABLE_NAME)!.set(row.COLUMN_NAME, kind);
    }
    return map;
}

/** The kind of `column` in `table`, when it is a date column. */
export function dateKindOf(
    dateMap: DateColumnMap | undefined,
    table: string,
    column: string,
): TDateKind | undefined {
    return dateMap?.get(table)?.get(column);
}

/** `2024-12-31T23:00:00.000Z` → `2024-12-31`; a bare date is left alone. */
function asDateOnly(value: string): string {
    if (ISO_DATE.test(value)) return value;
    if (ISO_INSTANT.test(value)) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
    return value;
}

/**
 * An instant in the form MySQL stores: UTC, `YYYY-MM-DD HH:mm:ss`, no zone.
 * A bare calendar day is widened to midnight, because the column keeps a time.
 */
function asDateTime(value: string): string {
    if (ISO_INSTANT.test(value)) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 19).replace('T', ' ');
        }
    }
    if (ISO_DATE.test(value)) return `${value} 00:00:00`;
    return value;
}

/**
 * The value to bind for one date column: a `Date` or an ISO string becomes the
 * MySQL literal, anything else (a number, a non-ISO string, `null`) is returned
 * untouched so the caller sees the same error it would have seen before.
 */
export function normalizeDateValue(value: unknown, kind: TDateKind): unknown {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return value;
        return kind === 'date'
            ? value.toISOString().slice(0, 10)
            : value.toISOString().slice(0, 19).replace('T', ' ');
    }
    if (typeof value !== 'string') return value;
    return kind === 'date' ? asDateOnly(value) : asDateTime(value);
}

/**
 * Normalise the date values of a params object bound for `table`.
 *
 * Returns a new object (does not mutate the input), like `prepareInputParams`.
 */
export function prepareDateParams(
    params: Record<string, unknown>,
    dateMap: DateColumnMap | undefined,
    table: string,
): Record<string, unknown> {
    const columns = dateMap?.get(table);
    if (!columns) return params;
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
        const kind = columns.get(key);
        if (kind === undefined) {
            result[key] = value;
            continue;
        }
        const normalised = normalizeDateValue(value, kind);
        if (normalised !== value) changed = true;
        result[key] = normalised;
    }
    return changed ? result : params;
}
