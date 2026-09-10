/**
 * Deterministic, aligned text-table renderer for `blong-dev sql` output.
 *
 * Modelled on `ut-function/packages/console-table` (per-column width derived from
 * content, a per-column cap, and ellipsis truncation) but implemented as a pure
 * function that returns a string and uses no Node-only APIs, so it can also run
 * in the browser (no `process`, no `Buffer`). *
 * SQL-aware cell formatting:
 *  - `null` / `undefined` → `NULL`
 *  - `Uint8Array` / `Buffer` → `0x…` hex (truncated)
 *  - `Date` → ISO 8601
 *  - `bigint` → plain string
 *  - objects/arrays → JSON
 */

export interface TableOptions {
    /** Optional table name printed as a header line. */
    name?: string;
    /** Maximum total width of the table. Defaults to 190. */
    maxWidth?: number;
    /** Maximum width of a single column. Defaults to 40. */
    maxColWidth?: number;
    /** Colorize header cells (browser-safe: caller supplies the ANSI wrapper). */
    headerColor?: (text: string) => string;
    /** Colorize the table name (browser-safe: caller supplies the ANSI wrapper). */
    nameColor?: (text: string) => string;
}

/** Format a single cell value for display. */
export function cellText(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Uint8Array) {
        let hex = '';
        for (const byte of value) hex += byte.toString(16).padStart(2, '0');
        return hex.length > 40 ? `0x${hex.slice(0, 40)}…` : `0x${hex}`;
    }
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/** Truncate `text` to `width` with an ellipsis when it overflows. */
function truncate(text: string, width: number): string {
    return text.length > width ? text.slice(0, Math.max(1, width - 1)) + '…' : text;
}

/** Pad `text` to `width` with trailing spaces. */
function pad(text: string, width: number): string {
    return text + ' '.repeat(Math.max(0, width - text.length));
}

/**
 * Render query result rows as a deterministic, aligned text table.
 *
 * Pure function: returns a string, performs no I/O. Column order follows the
 * first row's key order, then any keys appearing only in later rows.
 */
export function formatTable(
    rows: Array<Record<string, unknown>>,
    options: TableOptions = {},
): string {
    const {name, maxWidth = 190, maxColWidth = 40, headerColor, nameColor} = options;
    if (rows.length === 0) {
        return name ? `${name}\n(no rows)` : '(no rows)';
    }

    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    const widths = new Map<string, number>();
    for (const column of columns) {
        let width = column.length;
        for (const row of rows) {
            width = Math.max(width, cellText(row[column]).length);
        }
        widths.set(column, Math.min(width, maxColWidth));
    }

    // Cap the total width by dropping the right-most columns that overflow.
    let fitted = columns;
    let used = 1;
    const budget: string[] = [];
    for (const column of columns) {
        const width = widths.get(column)!;
        if (used + width + (budget.length ? 2 : 0) > maxWidth) break;
        budget.push(column);
        used += width + (budget.length > 1 ? 2 : 0);
    }
    if (budget.length > 0 && budget.length < columns.length) fitted = budget;

    const cell = (value: string, width: number): string => pad(truncate(value, width), width);
    const color = (text: string, fn?: (t: string) => string): string => (fn ? fn(text) : text);

    const lines: string[] = [];
    if (name) lines.push(color(name, nameColor));
    lines.push(
        fitted
            .map(column => color(cell(column, widths.get(column)!), headerColor))
            .join('  ')
            .trimEnd(),
    );
    lines.push(
        fitted
            .map(column => '-'.repeat(widths.get(column)!))
            .join('  ')
            .trimEnd(),
    );
    for (const row of rows) {
        lines.push(
            fitted
                .map(column => cell(cellText(row[column]), widths.get(column)!))
                .join('  ')
                .trimEnd(),
        );
    }
    return lines.join('\n');
}
