import {type Knex} from '@feasibleone/blong/types';
import {Type, type TFunction, type TObject, type TSchema} from 'typebox';
import {type IColumnSchema} from './types.ts';
import {addColumn, capitalize, methodId} from './utils.ts';

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await knex.schema.createTable(tableName, (table: any) => {
            for (const [name, prop] of Object.entries(schema.properties))
                addColumn(table, name, prop as IColumnSchema, !required.has(name));
        });
        return {created: true, added: schemaProps, dropped: []};
    }
    const columnInfo = await knex(tableName).columnInfo();
    const existingColumns = new Set(Object.keys(columnInfo));
    const added: string[] = [];
    const dropped: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await knex.schema.alterTable(tableName, (table: any) => {
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
 * Generate CRUD handler functions and their TypeBox schemas for a given table.
 *
 * The returned `handlers` map can be called directly or stored as synthetic
 * handlers on the adapter object.  Operations already listed in
 * `existingHandlers` are skipped so realm-defined handlers take precedence.
 */
export async function schemaCrudBindImpl(
    knex: Knex,
    subject: string,
    objectName: string,
    schema: TObject,
    existingHandlers: string[] = [],
    tableName?: string,
): Promise<{
    handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
    schemas: Record<string, TFunction>;
}> {
    const existing = new Set(existingHandlers);
    const table = tableName ?? objectName;
    const objectId = `${objectName}Id`;
    const objectCapitalized = capitalize(objectName);
    const handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
    const schemas: Record<string, TFunction> = {};
    const required = new Set(schema.required ?? []);
    const idSchema = (schema.properties[objectId] as TSchema) ?? Type.String();
    const entitySchema = Type.Object(
        Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, v as TSchema])),
    );
    const allOptionalProps: Record<string, TSchema> = {};
    for (const [name, prop] of Object.entries(schema.properties))
        allOptionalProps[name] = Type.Optional(prop as TSchema);
    const addProps: Record<string, TSchema> = {};
    for (const [name, prop] of Object.entries(schema.properties)) {
        if (name === objectId && (prop as IColumnSchema).type === 'integer') continue;
        addProps[name] =
            required.has(name) && name !== objectId
                ? (prop as TSchema)
                : Type.Optional(prop as TSchema);
    }

    const getName = `${subject}${objectCapitalized}Get`;
    if (!existing.has(getName)) {
        handlers[getName] = async (params: Record<string, unknown>) => {
            const {select = '*', ...where} = params;
            return knex(table)
                .where(where)
                .first(select as string);
        };
        schemas[getName] = Type.Function(
            [Type.Object({[objectId]: idSchema})],
            Type.Promise(entitySchema),
        );
    }

    const findName = `${subject}${objectCapitalized}Find`;
    if (!existing.has(findName)) {
        handlers[findName] = async (params: Record<string, unknown>) => {
            const {select = '*', order, limit, offset, ...where} = params;
            let query = knex(table).where(where);
            if (order) query = query.orderBy(order as string);
            if (limit) query = query.limit(limit as number);
            if (offset) query = query.offset(offset as number);
            return query.select(select as string);
        };
        schemas[findName] = Type.Function(
            [
                Type.Object({
                    ...allOptionalProps,
                    select: Type.Optional(Type.String()),
                    order: Type.Optional(Type.String()),
                    limit: Type.Optional(Type.Integer()),
                    offset: Type.Optional(Type.Integer()),
                }),
            ],
            Type.Promise(Type.Array(entitySchema)),
        );
    }

    const addName = `${subject}${objectCapitalized}Add`;
    if (!existing.has(addName)) {
        handlers[addName] = async (params: Record<string, unknown>) => ({
            [objectId]: (await knex(table).insert(params))?.[0],
        });
        schemas[addName] = Type.Function(
            [Type.Object(addProps)],
            Type.Promise(Type.Object({[objectId]: idSchema})),
        );
    }

    const editName = `${subject}${objectCapitalized}Edit`;
    if (!existing.has(editName)) {
        handlers[editName] = async (params: Record<string, unknown>) => {
            const {key: keyName = objectId, ...columns} = params;
            const {[keyName as string]: key, ...update} = columns;
            return knex(table)
                .where({[keyName as string]: key})
                .update(update);
        };
        schemas[editName] = Type.Function(
            [Type.Object({[objectId]: idSchema, ...allOptionalProps})],
            Type.Promise(Type.Integer({description: 'Number of affected rows'})),
        );
    }

    const removeName = `${subject}${objectCapitalized}Remove`;
    if (!existing.has(removeName)) {
        handlers[removeName] = async (params: Record<string, unknown>) =>
            knex(table)
                .where({[objectId]: params[objectId]})
                .del();
        schemas[removeName] = Type.Function(
            [Type.Object({[objectId]: idSchema})],
            Type.Promise(Type.Integer({description: 'Number of affected rows'})),
        );
    }

    const mergeName = `${subject}${objectCapitalized}Merge`;
    if (!existing.has(mergeName)) {
        handlers[mergeName] = async (params: Record<string, unknown>) =>
            knex(table).insert(params).onConflict(objectId).merge();
        schemas[mergeName] = Type.Function(
            [
                Type.Object(
                    Object.fromEntries(
                        Object.entries(schema.properties).map(([k, v]) => [k, v as TSchema]),
                    ),
                ),
            ],
            Type.Promise(Type.Unknown()),
        );
    }

    return {handlers, schemas};
}

/**
 * Store each handler from `handlersMap` on `self` under two keys so it can be
 * reached via both framework dispatch and `super` calls:
 *
 * - `methodId(name)` (e.g. `"sqlschemaitemadd"`) — used by `findHandler`
 * - `name`           (e.g. `"sqlSchemaItemAdd"`) — used by `super.name` in
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
