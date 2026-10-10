import type {ICommanderLevel} from '../types.ts';
import {getPath} from './getPath.ts';

/**
 * `levelRowsSelect` — the rows of a level that a whitelist/blacklist admits.
 *
 * A commander source is declared for the deployment that reads it, not for the
 * environment it happens to run in: the Kubernetes source lists the *cluster's*
 * namespaces, and a cluster carries whatever its own work created beside the four
 * namespaces Kubernetes itself owns. Which of those rows belong to this source is
 * therefore a property of the level — declared as regexes in the source vocabulary
 * (`include` = whitelist, `exclude` = blacklist) and applied here, in the single
 * place every source's children come through, beside the ordering that makes the
 * same rows reproducible.
 *
 * Both lists match the value the level *displays* (`labelField`, else `keyField`),
 * because that is what the navigator tree shows and what a reader recognises a row
 * by; a pattern written against a field nobody sees would filter by accident. A row
 * whose display value is absent reads as an empty string, which a pattern can match
 * deliberately (`^$`) but which no ordinary pattern matches by accident.
 *
 * A pattern that does not compile is a configuration mistake and is reported rather
 * than skipped: an explorer that quietly dropped half a filter would look exactly
 * like one whose backend answered with the wrong rows, and the reader would have no
 * way to tell the two apart.
 */
export function levelRowsSelect(level: ICommanderLevel, rows: unknown[]): unknown[] {
    const include = compile(level, 'include');
    const exclude = compile(level, 'exclude');
    if (!include.length && !exclude.length) return rows;
    return rows.filter(row => {
        const value = displayValue(level, row);
        if (include.length && !include.some(pattern => pattern.test(value))) return false;
        return !exclude.some(pattern => pattern.test(value));
    });
}

/** What this level displays for one row — the field the navigator and table show. */
function displayValue(level: ICommanderLevel, row: unknown): string {
    const field = level.labelField || level.keyField;
    if (!field) return '';
    const value = getPath(row as Record<string, unknown> | undefined, field);
    return value === undefined || value === null ? '' : String(value);
}

/** Compile a declared list, naming the level and the list a bad pattern came from. */
function compile(level: ICommanderLevel, list: 'include' | 'exclude'): RegExp[] {
    return (level[list] ?? []).map(pattern => {
        try {
            return new RegExp(pattern);
        } catch (error) {
            throw new Error(
                `commander: invalid ${list} regex ${JSON.stringify(pattern)} on level ` +
                    `'${level.resourceType}': ${(error as Error).message}`,
            );
        }
    });
}
