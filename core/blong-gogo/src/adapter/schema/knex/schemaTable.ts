import {type Knex} from '@feasibleone/blong/types';
import {type TObject} from 'typebox';
import {type IColumnSchema, type ITableConstraints} from './types.ts';
import {addColumn, methodId} from './utils.ts';

/**
 * Create or synchronise a database table from a TypeBox `TObject` schema.
 *
 * - If the table does **not** exist it is created.
 * - If it does, columns present in the schema but absent from the table are
 *   added.  Existing columns are never modified.
 * - Columns absent from the schema are dropped only when `dropColumns: true`.
 *
 * The operation is idempotent: a second call without schema changes produces
 * no SQL.
 *
 * Table-level constraints (composite PKs, unique, foreign key, indexes) should
 * be applied in a **second pass** via {@link schemaTableConstraintSyncImpl}
 * after all tables exist, so foreign-key target tables are guaranteed present.
 *
 * Constraints are declared via the TypeBox `TObject` options parameter:
 *
 * ```ts
 * type.Object({...columns}, {
 *     constraints: {
 *         primaryKey: {columns: ['colA', 'colB']},
 *         unique: {typeAlias: {}},
 *         foreign: {typeId: 'core.type.typeId'},
 *         index: {resourceName: {}},
 *     },
 * })
 * ```
 */
export async function schemaTableSyncImpl(
    knex: Knex,
    tableName: string,
    schema: TObject,
    options: {dropColumns?: boolean} = {},
): Promise<{created: boolean; added: string[]; dropped: string[]}> {
    const required = new Set(schema.required ?? []);
    const schemaProps = Object.keys(schema.properties);
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) {
        await knex.schema.createTable(tableName, table => {
            for (const [name, prop] of Object.entries(schema.properties))
                addColumn(table, name, prop as IColumnSchema, !required.has(name));
        });
        return {created: true, added: schemaProps, dropped: []};
    }
    const columnInfo = await knex(tableName).columnInfo();
    const existingColumns = new Set(Object.keys(columnInfo));
    const added: string[] = [];
    const dropped: string[] = [];
    await knex.schema.alterTable(tableName, table => {
        for (const [name, prop] of Object.entries(schema.properties)) {
            if (!existingColumns.has(name)) {
                addColumn(table, name, prop as IColumnSchema, true);
                added.push(name);
            }
        }
        if (options.dropColumns) {
            for (const col of existingColumns) {
                if (!schemaProps.includes(col)) {
                    table.dropColumn(col);
                    dropped.push(col);
                }
            }
        }
    });
    return {created: false, added, dropped};
}

/**
 * Apply table-level constraints (composite PKs, unique, indexes, foreign keys)
 * for an **existing** table via `alterTable`.  This is a separate step so it
 * can be called **after** all tables have been created, guaranteeing that
 * foreign-key target tables exist.
 *
 * Already-present constraints/indexes are skipped (idempotent).
 */
export async function schemaTableConstraintSyncImpl(
    knex: Knex,
    tableName: string,
    constraints: ITableConstraints,
): Promise<void> {
    const existingConstraints = (
        await knex('information_schema.TABLE_CONSTRAINTS').select('CONSTRAINT_NAME').where({
            TABLE_SCHEMA: knex.client.database(),
            TABLE_NAME: tableName,
        })
    ).map(c => (c.CONSTRAINT_NAME === 'PRIMARY' ? `${tableName}_pk` : c.CONSTRAINT_NAME));
    const existingIndexes = (
        await knex('information_schema.STATISTICS').select('INDEX_NAME').where({
            TABLE_SCHEMA: knex.client.database(),
            TABLE_NAME: tableName,
        })
    ).map(i => i.INDEX_NAME);

    await knex.schema.table(tableName, table => {
        // Composite primary key
        if (constraints.primaryKey) {
            if (typeof constraints.primaryKey === 'string') {
                if (!existingConstraints.includes(`${tableName}_pk`))
                    table.primary([constraints.primaryKey], `${tableName}_pk`);
            } else {
                const name = constraints.primaryKey.constraintName ?? `${tableName}_pk`;
                if (!existingConstraints.includes(name))
                    table.primary([...constraints.primaryKey.columns], name);
            }
        }

        // Unique constraints
        if (constraints.unique) {
            for (const [key, def] of Object.entries(constraints.unique)) {
                const name = `${tableName}_ux_${key}`;
                if (existingConstraints.includes(name)) continue;
                const cols = def.columns ?? [key];
                table.unique(cols, {indexName: name});
            }
        }

        // Indexes
        if (constraints.index) {
            for (const [key, def] of Object.entries(constraints.index)) {
                const name = `${tableName}_idx_${key}`;
                if (existingIndexes.includes(name)) continue;
                const cols = def.columns ?? [key];
                table.index(cols, name, def.indexType);
            }
        }

        // Foreign key constraints
        if (constraints.foreign) {
            for (const [key, def] of Object.entries(constraints.foreign)) {
                const name = `${tableName}_fk_${key}`;
                if (existingConstraints.includes(name)) continue;
                const ref = typeof def === 'string' ? {references: def} : def;
                const lastDot = ref.references.lastIndexOf('.');
                const refTable = ref.references.slice(0, lastDot).replaceAll('.', '_');
                const refCol = ref.references.slice(lastDot + 1);
                const cols = typeof def === 'string' ? [key] : (def.columns ?? [key]);
                const fk = table.foreign(cols, name);
                const fkr = fk.references(cols.map(() => refCol));
                fkr.inTable(refTable);
                if (ref.onDelete) fkr.onDelete(ref.onDelete);
                if (ref.onUpdate) fkr.onUpdate(ref.onUpdate);
            }
        }
    });
}

/**
 * Store each handler from `handlersMap` on `self` under two keys so it can be
 * reached via both framework dispatch and `super` calls:
 *
 * - `methodId(name)` (e.g. `"sqlitemadd"`) — used by `findHandler`
 * - `name`           (e.g. `"sqlItemAdd"`) — used by `super.name` in
 *                    object-form realm handler overrides
 */
export function attachHandlers(
    self: Record<string, unknown>,
    handlersMap: Record<string, unknown>,
): void {
    for (const [name, fn] of Object.entries(handlersMap)) {
        self[methodId(name)] = fn;
        self[name] = fn;
    }
}
