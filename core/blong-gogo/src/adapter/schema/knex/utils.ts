import {readFileSync, readdirSync} from 'node:fs';
import {basename, join} from 'node:path';
import {Type, type TSchema} from 'typebox';
import {type IColumnSchema} from './types.ts';

export {type IColumnSchema};

export function propType(prop: IColumnSchema): string {
    if ('type' in prop && prop.type) {
        switch (prop.type) {
            case 'string':
                if (prop.format === 'date-time' || prop.format === 'datetime') return 'datetime';
                if (prop.format === 'date') return 'date';
                if (prop.format === 'time') return 'time';
                if (prop.format === 'uuid') return 'uuid';
                return 'string';
            default:
                return prop.type;
        }
    } else if ('anyOf' in prop && Array.isArray(prop.anyOf)) {
        const found = prop.anyOf.find(p => p.type && p.type !== 'null');
        if (found) return propType(found);
    }
    return 'unknown';
}

export function propDefault(prop: IColumnSchema): unknown {
    if (prop.default !== undefined) return prop.default;
    else if ('anyOf' in prop && Array.isArray(prop.anyOf)) {
        const found = prop.anyOf.find(p => p.default !== undefined);
        if (found) return propDefault(found);
    }
    return undefined;
}

export function addColumn(
    table: Record<string, (columnName: string, size?: number) => unknown>,
    columnName: string,
    prop: IColumnSchema,
    isNullable: boolean,
): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let column: any;
    const defaultValue = propDefault(prop);
    if (defaultValue === 'auto-increment') {
        column = table.increments(columnName);
        return;
    }
    switch (propType(prop)) {
        case 'datetime':
            column = table.dateTime(columnName);
            break;
        case 'date':
            column = table.date(columnName);
            break;
        case 'time':
            column = table.time(columnName);
            break;
        case 'uuid':
            column = table.uuid(columnName);
            break;
        case 'string':
            if (prop.maxLength != null && prop.maxLength > 255) column = table.text(columnName);
            else column = table.string(columnName, prop.maxLength ?? 255);
            break;
        case 'number':
            column = table.double(columnName);
            break;
        case 'integer':
            column = table.integer(columnName);
            break;
        case 'boolean':
            column = table.boolean(columnName);
            break;
        case 'array':
        case 'object':
            column = table.json(columnName);
            break;
        default:
            column = table.text(columnName);
            break;
    }
    if (isNullable) column.nullable();
    else column.notNullable();
    if (defaultValue !== undefined) column.defaultTo(defaultValue);
}

export function sqlTypeToTypebox(sqlType: string): TSchema {
    switch (sqlType.toUpperCase()) {
        case 'VARCHAR':
        case 'CHAR':
        case 'TEXT':
        case 'MEDIUMTEXT':
        case 'LONGTEXT':
        case 'TINYTEXT':
        case 'ENUM':
        case 'SET':
            return Type.String();
        case 'INT':
        case 'INTEGER':
        case 'BIGINT':
        case 'SMALLINT':
        case 'TINYINT':
        case 'MEDIUMINT':
            return Type.Integer();
        case 'DECIMAL':
        case 'FLOAT':
        case 'DOUBLE':
        case 'NUMERIC':
        case 'REAL':
            return Type.Number();
        case 'BOOLEAN':
        case 'BOOL':
        case 'BIT':
            return Type.Boolean();
        case 'DATE':
            return Type.String({format: 'date'});
        case 'DATETIME':
        case 'TIMESTAMP':
            return Type.String({format: 'date-time'});
        case 'TIME':
            return Type.String({format: 'time'});
        case 'JSON':
            return Type.Unknown();
        default:
            return Type.String();
    }
}

export function snakeToCamel(str: string): string {
    return str.replace(/([-_]\w)/g, g => g[1].toUpperCase());
}

export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Normalise a handler name for registry look-up: remove dots, lowercase. */
export function methodId(name: string): string {
    return name.replace(/\./g, '').toLowerCase();
}

/**
 * Collapse whitespace and uppercase SQL for content comparison.
 * Line comments are stripped before collapsing.
 */
export function normalizeSQL(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

/**
 * Extract the procedure body (BEGIN … END block) from a full CREATE PROCEDURE
 * statement so it can be compared against MySQL's `ROUTINE_DEFINITION` column,
 * which stores only the body.  Returns the full SQL if no BEGIN is found.
 */
export function extractProcedureBody(sql: string): string {
    const upper = sql.toUpperCase();
    const beginIdx = upper.indexOf('BEGIN');
    if (beginIdx === -1) return sql;
    const endIdx = upper.lastIndexOf('END');
    if (endIdx === -1) return sql;
    return sql.slice(beginIdx, endIdx + 3);
}

/**
 * Scan a directory for `.sql` files and return their base names and contents.
 */
export function readSqlFiles(dir: string): Array<{name: string; sql: string}> {
    const files = readdirSync(dir).filter(f => f.endsWith('.sql'));
    return files.map(f => ({
        name: basename(f, '.sql'),
        sql: readFileSync(join(dir, f), 'utf8'),
    }));
}
