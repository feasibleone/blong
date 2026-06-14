import {type Knex} from '@feasibleone/blong/types';
import {Type, type TFunction, type TSchema} from 'typebox';
import {attachHandlers} from './schemaTable.ts';
import {
    extractProcedureBody,
    methodId,
    normalizeSQL,
    readSqlFiles,
    snakeToCamel,
    sqlTypeToTypebox,
} from './utils.ts';

interface IParameter {
    PARAMETER_NAME: string;
    DATA_TYPE: string;
    PARAMETER_MODE: string;
}

function _dbName(knex: Knex): string | undefined {
    return (knex as unknown as {client?: {config?: {connection?: {database?: string}}}})?.client
        ?.config?.connection?.database;
}

async function _getParameters(knex: Knex, dbName: string, spName: string): Promise<IParameter[]> {
    return knex
        .select('PARAMETER_NAME', 'DATA_TYPE', 'PARAMETER_MODE')
        .from('information_schema.PARAMETERS')
        .where('SPECIFIC_SCHEMA', dbName)
        .where('SPECIFIC_NAME', spName)
        .whereNotNull('PARAMETER_NAME')
        .orderBy('ORDINAL_POSITION');
}

function _makeCallable(
    knex: Knex,
    spName: string,
    inParams: IParameter[],
): (params: Record<string, unknown>) => Promise<unknown> {
    return async (params: Record<string, unknown>) => {
        const placeholders = inParams.map(() => '?').join(', ');
        const values = inParams.map(p => params[snakeToCamel(p.PARAMETER_NAME)]);
        const result = await knex.raw(`CALL \`${spName}\`(${placeholders})`, values as string[]);
        return Array.isArray(result?.[0]) ? result[0][0] : result?.[0];
    };
}

/**
 * Synchronise stored procedures to the database.
 *
 * Accepts either a directory path (all `.sql` files are loaded) or an array of
 * `{name, sql}` objects.
 *
 * **Only procedures whose body differs from the current definition are
 * re-created** — so repeated startups with an unchanged schema are cheap.
 *
 * Procedures whose name starts with `_` are synced as normal — the underscore
 * prefix is a convention that marks them as private DB helpers.  They will be
 * synced but will **not** be bound as synthetic API handlers.
 */
export async function schemaProcedureSyncImpl(
    knex: Knex,
    procedures: string | Array<{name: string; sql: string}>,
): Promise<{created: string[]; skipped: string[]}> {
    const dbName = _dbName(knex);
    let definitions: Array<{name: string; sql: string}>;
    if (typeof procedures === 'string') {
        definitions = readSqlFiles(procedures);
    } else {
        definitions = procedures;
    }
    const created: string[] = [];
    const skipped: string[] = [];
    for (const {name, sql} of definitions) {
        if (dbName) {
            const existing: Array<{ROUTINE_DEFINITION: string}> = await knex
                .select('ROUTINE_DEFINITION')
                .from('information_schema.ROUTINES')
                .where('ROUTINE_SCHEMA', dbName)
                .where('ROUTINE_NAME', name)
                .where('ROUTINE_TYPE', 'PROCEDURE');
            if (existing.length > 0 && existing[0].ROUTINE_DEFINITION) {
                const storedNorm = normalizeSQL(existing[0].ROUTINE_DEFINITION);
                const newNorm = normalizeSQL(extractProcedureBody(sql));
                if (storedNorm === newNorm) {
                    skipped.push(name);
                    continue;
                }
            }
        }
        await knex.raw('DROP PROCEDURE IF EXISTS ??', [name]);
        await knex.raw(sql);
        created.push(name);
    }
    return {created, skipped};
}

/**
 * Discover stored procedures whose names match `namespace` in the database and
 * generate a callable handler function and TypeBox schema for each.
 *
 * Procedures starting with `_` are intentionally excluded — they are private
 * DB helpers not intended to be exposed via the API layer.
 *
 * Input parameter types are derived from `information_schema.PARAMETERS`.
 */
export async function schemaProcedureBindImpl(
    knex: Knex,
    namespace: string,
    schema?: string,
): Promise<{
    handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
    schemas: Record<string, TFunction>;
}> {
    const dbName =
        schema ??
        (knex as unknown as {client?: {config?: {connection?: {database?: string}}}})?.client
            ?.config?.connection?.database;
    const procedures: Array<{ROUTINE_NAME: string}> = await knex
        .select('ROUTINE_NAME')
        .from('information_schema.ROUTINES')
        .where('ROUTINE_SCHEMA', dbName)
        .where('ROUTINE_TYPE', 'PROCEDURE')
        .andWhere('ROUTINE_NAME', 'like', `${namespace}%`);
    const handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
    const schemas: Record<string, TFunction> = {};
    for (const proc of procedures) {
        const spName = proc.ROUTINE_NAME;
        if (spName.startsWith('_')) continue;
        const handlerName = snakeToCamel(spName);
        const parameters = await _getParameters(knex, dbName!, spName);
        const inParams = parameters.filter(
            p => p.PARAMETER_MODE === 'IN' || p.PARAMETER_MODE === 'INOUT',
        );
        handlers[handlerName] = _makeCallable(knex, spName, inParams);
        const paramProperties: Record<string, TSchema> = {};
        for (const p of inParams)
            paramProperties[snakeToCamel(p.PARAMETER_NAME)] = sqlTypeToTypebox(p.DATA_TYPE);
        schemas[handlerName] = Type.Function(
            [Type.Object(paramProperties)],
            Type.Promise(Type.Unknown()),
        );
    }
    return {handlers, schemas};
}

/**
 * Discover **all** stored procedures in the connected database and wire each as
 * a synthetic own-property handler on the adapter object so that
 * `AdapterBase.findHandler` resolves them before falling back to `exec`.
 *
 * Each handler is stored under **two keys**:
 * - `methodId(camelName)` (e.g. `"sqlitemlistactive"`) — the normalised key
 *   used by `findHandler`.
 * - `camelName` (e.g. `"sqlItemListActive"`) — allows realm handler overrides
 *   to call the synthetic version via `super.sqlItemListActive(params, $meta)`.
 *
 * Procedures whose name starts with `_` are **skipped** — they are private DB
 * helpers intentionally excluded from the API surface.
 */
export async function bindSyntheticHandlers(
    self: Record<string, unknown>,
    knex: Knex,
): Promise<void> {
    const dbName = _dbName(knex);
    if (!dbName) return;
    const procedures: Array<{ROUTINE_NAME: string}> = await knex
        .select('ROUTINE_NAME')
        .from('information_schema.ROUTINES')
        .where('ROUTINE_SCHEMA', dbName)
        .where('ROUTINE_TYPE', 'PROCEDURE');
    for (const proc of procedures) {
        const spName = proc.ROUTINE_NAME;
        if (spName.startsWith('_')) continue;
        const camelName = snakeToCamel(spName);
        const parameters = await _getParameters(knex, dbName, spName);
        const inParams = parameters.filter(
            p => p.PARAMETER_MODE === 'IN' || p.PARAMETER_MODE === 'INOUT',
        );
        const callable = _makeCallable(knex, spName, inParams);
        self[methodId(camelName)] = callable;
        self[camelName] = callable;
    }
}

/**
 * Bind CRUD synthetic handlers for every table in `tables`, keyed by namespace.
 * Called from `ready()` when `config.namespace` is set.
 */
export async function bindSyntheticCrud(
    self: Record<string, unknown>,
    knex: Knex,
    namespace: string,
    tables: Array<{tableName: string; definition: import('typebox').TObject}>,
): Promise<void> {
    const {schemaCrudBindImpl} = await import('./schemaTable.ts');
    for (const {tableName, definition} of tables) {
        const objectName = snakeToCamel(tableName);
        const {handlers} = await schemaCrudBindImpl(
            knex,
            namespace,
            objectName,
            definition,
            [],
            tableName,
        );
        attachHandlers(self, handlers);
    }
}
