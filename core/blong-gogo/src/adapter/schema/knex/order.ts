/**
 * The `order` / `orderBy` clause a caller sends, folded into what knex reads.
 *
 * A portal sends `[{field: 'coralName', dir: 'ASC'}]` (`useTableList` and the
 * Explorer both do), while knex reads `{column, order}` — and anything else it
 * cannot see is formatted as the literal `undefined`, producing
 * `order by \`undefined\`` and a MySQL `Unknown column 'undefined' in 'order
 * clause'` on every column the reader sorts by. So the shape is normalised here,
 * once, and both spellings work.
 *
 * A column name is passed to knex as an identifier and knex backticks it, so a
 * reserved word (`order` on `marine.family`) is safe in this clause — the reason
 * a sort never had to be told to avoid one @@D-742.
 */
const DIRECTIONS = new Set(['asc', 'desc']);

/** One order term, already reduced to a column and a direction. */
export interface IOrderTerm {
    column: string;
    order: 'asc' | 'desc';
}

function direction(value: unknown): 'asc' | 'desc' {
    const text = typeof value === 'string' ? value.toLowerCase() : '';
    return DIRECTIONS.has(text) ? (text as 'asc' | 'desc') : 'asc';
}

function termOf(entry: unknown): IOrderTerm | undefined {
    if (typeof entry === 'string') {
        // `'name desc'` is knex's own shorthand; keep it usable.
        const [column, dir] = entry.trim().split(/\s+/);
        return column ? {column, order: direction(dir)} : undefined;
    }
    if (!entry || typeof entry !== 'object') return undefined;
    const record = entry as Record<string, unknown>;
    const column = record['column'] ?? record['field'];
    if (typeof column !== 'string' || !column) return undefined;
    return {column, order: direction(record['order'] ?? record['dir'])};
}

/**
 * Every order term a caller asked for, in order.
 *
 * An unrecognised entry is dropped rather than turned into `undefined`: a clause
 * nobody can read is worse than a row order nobody chose. Accepts one term or a
 * list of them.
 */
export function normalizeOrderBy(value: unknown): IOrderTerm[] {
    if (value == null) return [];
    const entries = Array.isArray(value) ? value : [value];
    return entries.map(termOf).filter((term): term is IOrderTerm => term !== undefined);
}
