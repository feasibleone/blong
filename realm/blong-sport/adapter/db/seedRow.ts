import {library} from '@feasibleone/blong';

/**
 * `seedRows` — read one section of a seed asset as a list of rows.
 *
 * A seed is read by a person as much as by the database, so a section may be
 * written in three shapes and this library normalises them:
 *
 * - **the explicit form** — a list of maps, one key per column, exactly what the
 *   generic merge takes. It keeps working unchanged;
 * - **a table** — `|`-separated lines with a header naming the columns and an
 *   optional `---` separator. Padding aligns the columns for a reader and is
 *   trimmed away;
 * - **one line per record** — `key: value` pairs separated by commas, where a
 *   segment without a colon is the row's `name`.
 *
 * A blank line and a line whose first character is `#` are ignored, so a
 * section can be commented. An empty cell is not a value: the row is left
 * without that key, and the handler's defaults decide what it means.
 *
 * The parser knows nothing about sports, people or the columns of either: the
 * handler maps a short key (`code`, `sex`) to a column and fills what the file
 * left out, so a realm can change its vocabulary without touching this.
 *
 * Wire: a library function of the `sport.db` handler group, used by
 * `sport.nomenclature.merge` and `sport.register.merge`.
 */
export default library(() => {
    /** `key: value` pairs separated by commas; a bare segment is the name. */
    function parseLine(line: string): Record<string, unknown> {
        const row: Record<string, unknown> = {};
        for (const segment of line.split(',')) {
            const part = segment.trim();
            if (!part) continue;
            const at = part.indexOf(':');
            if (at < 0) {
                if (row.name === undefined) row.name = part;
                continue;
            }
            const key = part.slice(0, at).trim();
            const value = part.slice(at + 1).trim();
            if (key) row[key] = value === '' ? undefined : value;
        }
        return row;
    }

    /** The cells of one `|`-separated line, trimmed. */
    function cells(line: string): string[] {
        return line
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(cell => cell.trim());
    }

    /** A table block: the first line names the columns, a `---` row is skipped. */
    function parseTable(lines: string[]): Array<Record<string, unknown>> {
        const header = cells(lines[0]);
        const rows: Array<Record<string, unknown>> = [];
        for (const line of lines.slice(1)) {
            const values = cells(line);
            if (values.every(value => value === '' || /^-{2,}$/.test(value))) continue;
            const row: Record<string, unknown> = {};
            header.forEach((key, index) => {
                const value = values[index];
                if (key && value !== undefined && value !== '') row[key] = value;
            });
            rows.push(row);
        }
        return rows;
    }

    /** The rows of a block of text. */
    function parseText(text: string): Array<Record<string, unknown>> {
        const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        if (!lines.length) return [];
        return lines[0].startsWith('|') ? parseTable(lines) : lines.map(parseLine);
    }

    return {
        seedRows(input: unknown): Array<Record<string, unknown>> {
            if (typeof input === 'string') return parseText(input);
            if (Array.isArray(input)) {
                return input.flatMap(item =>
                    typeof item === 'string'
                        ? parseText(item)
                        : item && typeof item === 'object'
                          ? [item as Record<string, unknown>]
                          : [],
                );
            }
            return [];
        },

        /**
         * The sex an event name states: `Men`/`Women` at the start, or `Mixed`
         * when men and women contest it together. A name that states neither is
         * an event both sexes contest separately, and has no sex of its own —
         * which is not the same as `mixed`.
         */
        seedSex(name: string): string | undefined {
            if (/\bWomen\b/.test(name)) return 'female';
            if (/\bMen\b/.test(name)) return 'male';
            if (/\bMixed\b/.test(name)) return 'mixed';
            return undefined;
        },
    };
});
