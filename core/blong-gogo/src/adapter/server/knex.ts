import {ulid, withProgress} from '@feasibleone/blong-lib';
import {
    adapter,
    type Adapter,
    type Errors,
    type IErrorMap,
    type IHandlerProxy,
    type IMeta,
    type IObjectSchema,
    type Knex,
} from '@feasibleone/blong/types';
import KnexLib from 'knex';
import crypto from 'node:crypto';
import {type TFunction, type TObject} from 'typebox';
import {v4} from 'uuid';
import yaml from 'yaml';
import {methodParts} from '../../lib.ts';
import {
    binaryToStr,
    discoverBinaryColumns,
    isBinaryColumn,
    prepareInputParams,
    prepareResultRow,
    prepareResultRows,
    strToBinary,
} from '../schema/knex/binary.ts';
import {ensureDatabase} from '../schema/knex/database.ts';
import {wrapKnex} from '../schema/knex/json.ts';
import {
    bindSyntheticHandlers,
    schemaProcedureBindImpl,
    schemaProcedureSyncImpl,
} from '../schema/knex/schemaMysql.ts';
import {
    attachHandlers,
    schemaTableConstraintSyncImpl,
    schemaTableSyncImpl,
} from '../schema/knex/schemaTable.ts';
import {
    type IConfig,
    type IEdgeBinding,
    type IKnexConfig,
    type ISchemaTable,
    type ITableConstraints,
} from '../schema/knex/types.ts';
import {
    type IColumnSchema,
    methodId,
    propDefault,
    propType,
    readSqlFiles,
    snakeToCamel,
} from '../schema/knex/utils.ts';

// Helpers to access the binary-column map stored on the adapter context.
// Cast through `any` because the base `ServerContext & BrowserContext` type
// doesn't include this runtime property.
function getBinaryCols(ctx: object): Map<string, Set<string>> | undefined {
    return (ctx as Record<string, unknown>).binaryColumns as Map<string, Set<string>> | undefined;
}
function setBinaryCols(ctx: object, map: Map<string, Set<string>>): void {
    (ctx as Record<string, unknown>).binaryColumns = map;
}

export type {IConfig, ISchemaTable} from '../schema/knex/types.ts';

const errorMap: IErrorMap = {
    'knex.generic': 'Knex Error',
    'knex.invalid': 'Invalid Knex Operation',
    'knex.notFound': 'Knex Not Found',
    'knex.exists': 'Knex Exists',
    'knex.unique': 'Knex Unique',
    'knex.missingKey': 'Missing key value for {key}',
};

let _errors: Errors<typeof errorMap>;

/**
 * Log MySQL deadlock details (including the offending query) in dev mode.
 * Called from the `wrapKnex` `onDeadlock` hook for every query path through the
 * wrapped knex: CRUD builders, `raw()`/stored-procedure calls, schema sync and
 * seed merges, and queries inside `transaction()` blocks.
 */
export function logKnexDeadlock(
    config: {debug?: boolean; logLevel?: string},
    log: unknown,
    error: unknown,
): void {
    if (!config.debug && config.logLevel !== 'debug') return;
    const err = error as {
        message?: string;
        code?: string;
        errno?: number;
        sql?: string;
        sqlMessage?: string;
    };
    (log as {error?: (...args: unknown[]) => void})?.error?.(
        {
            err: err.message ?? err,
            code: err.code,
            errno: err.errno,
            sql: err.sql,
            sqlMessage: err.sqlMessage,
        },
        'knex deadlock',
    );
}

export default adapter<IConfig>(({utError, schema: objectSchema}) => {
    _errors ||= utError.register(errorMap);

    /**
     * Master-detail: tables of `subject` whose schema declares a FK constraint
     * to the master's PK (`${subject}.${object}.${keyName}`). These are the
     * detail tables of `${subject}.${object}` — `add`/`edit` persist sibling
     * detail arrays into them and `get` returns their rows alongside the master.
     */
    const detailTables = (subject: string, object: string, keyName: string) => {
        const masterRef = `${subject}.${object}.${keyName}`;
        const result: Array<{table: string; fkColumn: string}> = [];
        for (const [name, definition] of Object.entries(objectSchema[subject] ?? {})) {
            if (name === object) continue;
            const foreign = (
                definition as {
                    constraints?: {foreign?: Record<string, string>};
                }
            )?.constraints?.foreign;
            if (!foreign) continue;
            const fkColumn = Object.keys(foreign).find(col => foreign[col] === masterRef);
            if (fkColumn) result.push({table: `${subject}_${name}`, fkColumn});
        }
        return result;
    };

    return {
        activation: {
            default: {
                type: 'knex',
                knex: {
                    client: 'mysql2',
                    connection: {
                        host: 'localhost',
                    },
                },
            },
        },
        async start() {
            const knexConfig = this.config.knex;
            if (knexConfig.createDatabase) {
                try {
                    const {created, database} = await ensureDatabase(knexConfig.connection ?? {});
                    if (created) {
                        this.log?.info?.({database}, 'created missing database');
                    }
                } catch (error) {
                    // Warn-and-continue: schema sync will surface the real error.
                    this.log?.warn?.(
                        {
                            err: (error as {message?: string}).message ?? String(error),
                        },
                        'could not auto-create database — will continue',
                    );
                }
            }
            this.config.context = {
                queryBuilder: wrapKnex(KnexLib(this.config.knex), {
                    onDeadlock: error => logKnexDeadlock(this.config, this.log, error),
                }) as unknown as Knex,
            };
            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                await this.config.context.queryBuilder?.destroy();
            } finally {
                this.config.context = {};
                result = await super.stop(...params);
            }
            return result;
        },
        /**
         * After the Knex pool is ready, optionally sync the declared schema
         * (tables + procedures) and bind all DB procedures as synthetic handlers.
         *
         * When `config.namespace` is set, CRUD handlers are also auto-bound for
         * every declared table, making them reachable via normal framework
         * dispatch without writing handler files.
         */
        async ready(this: Adapter<IConfig>) {
            const schema = this.config.schema;
            const knex = this.config.context?.queryBuilder;
            const self = this as unknown as Record<string, unknown>;

            if (schema?.sync && knex) {
                // Sort tables by ascending `order` so FK dependencies are respected.
                const tables = Object.entries(schema.tables ?? {}).sort(([, a], [, b]) => {
                    const orderOf = (spec: number | ISchemaTable | TObject): number =>
                        typeof spec === 'number'
                            ? spec
                            : typeof spec === 'object' && spec !== null
                              ? ((spec as ISchemaTable).order ?? 0)
                              : 0;
                    return orderOf(a) - orderOf(b);
                });
                const dropColumns = schema.dropColumns ?? false;
                const tableDefs: Array<{tableName: string; definition: TObject}> = [];
                let syncedTables = 0;
                await withProgress(
                    this.log,
                    'schema table sync',
                    (async () => {
                        for (const [tableName, tableConfig] of tables) {
                            const [subject, object] = tableName.split('.');
                            const {definition} = resolveTableSpec(
                                objectSchema,
                                tableConfig,
                                subject,
                                object,
                            );
                            if (!definition) continue;
                            const sqlName = tableName.replaceAll('.', '_');
                            await schemaTableSyncImpl(knex, sqlName, definition, {
                                dropColumns,
                            });
                            tableDefs.push({tableName: sqlName, definition});
                            syncedTables += 1;
                        }
                    })(),
                    {
                        getProgress: () => ({done: syncedTables, total: tables.length}),
                    },
                );

                // Second pass: apply constraints (PKs, unique, indexes, FKs) now
                // that all tables exist.
                let syncedConstraints = 0;
                await withProgress(
                    this.log,
                    'schema constraint sync',
                    (async () => {
                        for (const {tableName: sqlName, definition} of tableDefs) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const constraints = (definition as any).constraints as
                                | ITableConstraints
                                | undefined;
                            if (constraints) {
                                await schemaTableConstraintSyncImpl(knex, sqlName, constraints);
                                syncedConstraints += 1;
                            }
                        }
                    })(),
                    {
                        getProgress: () => ({done: syncedConstraints, total: tableDefs.length}),
                    },
                );

                // Collect procedure definitions: scanned folders first, then inline.
                const procedureDefs: Array<{name: string; sql: string}> = [];
                for (const folder of schema.procedurePaths ?? [])
                    procedureDefs.push(...readSqlFiles(folder));
                for (const [name, sql] of Object.entries(schema.procedures ?? {}))
                    procedureDefs.push({name, sql});
                if (procedureDefs.length > 0)
                    await withProgress(
                        this.log,
                        'schema procedure sync',
                        schemaProcedureSyncImpl(knex, procedureDefs),
                    );
            }

            if (schema && knex) {
                // Bind all DB procedures as synthetic handlers (skips `_`-prefixed).
                await bindSyntheticHandlers(self, knex);
            }
            if (schema?.seed) {
                // Seed merges each trigger an `access_pathRefresh()` full rebuild
                // by default.  During the batch we defer it — merges only write
                // `core_triple` edges and skip the rebuild (see `core.triple.merge`
                // deferPathRefresh handling) — then run ONE refresh at the end.
                // This avoids both redundant full rebuilds and the write-vs-refresh
                // deadlock between concurrent merges.
                (this.config.context as {deferPathRefresh?: boolean}).deferPathRefresh = true;
                try {
                    let currentSeed = '';
                    await withProgress(
                        this.log,
                        'seed data',
                        (async () => {
                            // 1. Process production seeds (db.asset modules)
                            await processSeedAssets(
                                this,
                                /\.db\.asset$/,
                                name => (currentSeed = name),
                            );
                            // 2. Process test seeds (dbTest.asset modules) only when dbTest is enabled
                            if (schema?.dbTest) {
                                await processSeedAssets(
                                    this,
                                    /\.dbTest\.asset$/,
                                    name => (currentSeed = name),
                                );
                            }
                            // 3. Single rebuild after all seed edges are in place.
                            if (schema?.accessPathRefresh)
                                await knex?.raw('CALL access_pathRefresh()');
                        })(),
                        {
                            getProgress: () => ({current: currentSeed || 'starting'}),
                        },
                    );
                } finally {
                    (this.config.context as {deferPathRefresh?: boolean}).deferPathRefresh = false;
                }
            }

            // Discover binary(16) columns for Buffer <-> string conversion.
            if (knex) {
                setBinaryCols(this.config.context, await discoverBinaryColumns(knex));
            }

            return super.ready();
        },
        async configChanged(
            diff: Map<string, {prev: unknown; next: unknown}>,
            next: unknown,
            _prev: unknown,
        ) {
            const knexChanged = Array.from(diff.keys()).some(
                (key: string) =>
                    key === this.config.id + '.knex' || key.startsWith(this.config.id + '.knex.'),
            );
            if (!knexChanged) return;
            await this.config.context?.queryBuilder?.destroy();
            const newKnexConfig =
                ((next as Record<string, unknown>)?.[this.config.id] as Record<string, unknown>)?.[
                    'knex'
                ] ?? this.config.knex;
            this.config.knex = newKnexConfig as IKnexConfig;
            this.config.context = {
                queryBuilder: wrapKnex(KnexLib(newKnexConfig as object), {
                    onDeadlock: error => logKnexDeadlock(this.config, this.log, error),
                }) as unknown as Knex,
            };
        },
        async exec(
            params: {
                key?: string;
                select?: string;
                order?: Parameters<Knex.QueryInterface['orderBy']>[0];
                orderBy?: Parameters<Knex.QueryInterface['orderBy']>[0];
                limit?: number;
                offset?: number;
                paging?: {pageNumber: number; pageSize: number};
                filterBy?: Record<string, unknown>;
            } & Record<string, unknown>,
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [subject, object, operation] = method!.split('.');
            // `{subject}.dropdown.list` — auto-bound dropdown lists for every
            // resource-backed table of the subject (see `_dropdownList`).
            if (object === 'dropdown' && operation === 'list') {
                return (
                    this as unknown as {_dropdownList(s: string): Promise<unknown>}
                )._dropdownList(subject);
            }
            const table = `${subject}_${object}`;
            switch (operation) {
                case 'get': {
                    const {select: _select, ...where} = params;
                    const qb = this.config.context.queryBuilder!;
                    const binaryCols = getBinaryCols(this.config.context);
                    const opts = tableOptions(objectSchema, this.config, subject, object);
                    let query = qb(table);
                    for (const [key, val] of Object.entries(where)) {
                        if (isBinaryColumn(binaryCols, table, key) && typeof val === 'string') {
                            query = query.where(key, strToBinary(val));
                        } else {
                            query = query.where(key, val as string | number);
                        }
                    }
                    const row = (await query.first()) as Record<string, unknown> | undefined;
                    const keyName =
                        (
                            objectSchema[subject]?.[object] as
                                | {constraints?: {primaryKey?: string}}
                                | undefined
                        )?.constraints?.primaryKey ?? `${object}Id`;
                    // Capture the raw PK **before** `prepareResultRow` mutates
                    // the row in place (Buffers → base64 strings). The edge
                    // attachment needs the binary master key.
                    const masterKey = row?.[keyName];
                    const result: Record<string, unknown> = {
                        [object]: prepareResultRow(row, binaryCols, table),
                    };
                    const masterRow = result[object] as Record<string, unknown> | undefined;
                    // Resource-backed: join the display name from
                    // `core_resource.resourceName` as `${object}Name`.
                    if (opts.resource && masterRow && typeof masterRow[keyName] === 'string') {
                        const [joined] = await joinResourceNames(
                            qb,
                            [masterRow],
                            keyName,
                            `${object}Name`,
                        );
                        result[object] = joined;
                    }
                    // Master-detail: return each FK-constrained detail table's
                    // rows as sibling arrays (e.g. `line`, `payment`) so the
                    // Open form can render them alongside the master record.
                    if (masterKey !== undefined) {
                        for (const detail of detailTables(subject, object, keyName)) {
                            const detailBinaryCols = getBinaryCols(this.config.context);
                            const detailRows = (await qb(detail.table).where({
                                [detail.fkColumn]: masterKey,
                            })) as Record<string, unknown>[];
                            result[detail.table.slice(subject.length + 1)] = prepareResultRows(
                                detailRows,
                                detailBinaryCols,
                                detail.table,
                            );
                        }
                        // Graph-edge master-detail (declarative `edges`) — the
                        // rows live in `core_triple` keyed by the resource id.
                        // Only binary (resource-backed) master keys participate.
                        if (Buffer.isBuffer(masterKey)) {
                            for (const binding of opts.edges) {
                                if (!binding.table) continue; // reverse-only cleanup binding
                                const detailObject =
                                    binding.object ??
                                    binding.predicate.replace(/^has/, '').toLowerCase();
                                result[detailObject] = await attachEdgeRows(qb, masterKey, binding);
                            }
                        }
                    }
                    return result;
                }
                case 'find': {
                    const {
                        select = '*',
                        paging,
                        orderBy,
                        order = orderBy,
                        limit = paging?.pageSize,
                        offset = paging && (paging?.pageNumber - 1) * paging?.pageSize,
                        filterBy,
                        search,
                        ...where
                    } = params;
                    const qb = this.config.context.queryBuilder!;
                    const binaryCols = getBinaryCols(this.config.context);
                    const opts = tableOptions(objectSchema, this.config, subject, object);
                    let query = qb(table);
                    for (const [key, val] of Object.entries({...filterBy, ...where})) {
                        if (isBinaryColumn(binaryCols, table, key) && typeof val === 'string') {
                            query = query.where(key, strToBinary(val));
                        } else {
                            query = query.where(key, val as string | number);
                        }
                    }
                    if (search) {
                        const stringFields = Object.entries(
                            objectSchema[subject]?.[object]?.properties ?? {},
                        )
                            .filter(([, prop]) => propType(prop) === 'string')
                            .map(([key]) => key);
                        if (stringFields.length > 0)
                            query = query.andWhere(function () {
                                for (const field of stringFields) {
                                    this.orWhereILike(field, `%${search}%`);
                                }
                            });
                    }
                    if (order) query = query.orderBy(order);
                    if (limit) query = query.limit(limit);
                    if (offset) query = query.offset(offset);
                    const rows = (await query.select(select)) as Record<string, unknown>[];
                    const prepared = prepareResultRows(rows, binaryCols, table);
                    // Resource-backed: join the display name from
                    // `core_resource.resourceName` as `${object}Name`.
                    if (opts.resource) {
                        return joinResourceNames(qb, prepared, `${object}Id`, `${object}Name`);
                    }
                    return prepared;
                }
                case 'add': {
                    const {
                        key: keyName = `${object}Id`,
                        [object]: columns,
                        resourceName,
                        ...rest
                    } = params;
                    // Resolve the table definition from the declarative
                    // `schema.tables` entry first (falling back to the realm
                    // `objectSchema`), so namespace-scoped methods (e.g.
                    // `sql.person.add`) find their properties/FK constraints
                    // when the definition lives in the adapter table config.
                    const definition = resolveTableSpec(
                        objectSchema,
                        this.config.schema?.tables?.[`${subject}.${object}`],
                        subject,
                        object,
                    ).definition as unknown as Record<string, unknown> | undefined;
                    const properties = definition?.properties as
                        | Record<string, IColumnSchema>
                        | undefined;
                    const foreignKeys = (
                        definition?.constraints as
                            | Record<string, Record<string, string>>
                            | undefined
                    )?.foreign;
                    const qb = this.config.context.queryBuilder!;
                    const binaryCols = getBinaryCols(this.config.context);
                    const opts = tableOptions(objectSchema, this.config, subject, object);
                    const cols = columns as Record<string, unknown>;
                    // Resource-backed: `${object}Name` is a virtual display field
                    // (the name lives in `core_resource.resourceName`) — capture
                    // it for the resource row and exclude it from the table insert.
                    const nameColValue = opts.resource
                        ? (cols[`${object}Name`] as string | undefined)
                        : undefined;
                    if (opts.resource) {
                        delete cols[`${object}Name`];
                    }
                    // Generate real PKs server-side for id columns that carry a
                    // 'uuid' / 'ulid' default marker (`type.uuid()` / `type.ulid()`
                    // are submitted as the literal placeholder) OR whose not-null
                    // id the caller did not supply on a resource-backed table
                    // (PK is a FK to `core.resource`, e.g. `type.uidNotNull()`).
                    // Track the generated key so the inserted row can be selected
                    // back by it.
                    let generatedKey: string | undefined;
                    // Ensure a `core_type` row exists (mirrors core.resource.ensure)
                    // so resource-backed inserts always get a type.
                    const ensureType = async (typeAlias: string): Promise<number | undefined> => {
                        const existing = await qb('core_type').where({typeAlias}).first('typeId');
                        if (existing) return existing.typeId as number;
                        await qb('core_type').insert({typeAlias}).onConflict().ignore();
                        const inserted = await qb('core_type').where({typeAlias}).first('typeId');
                        return inserted ? (inserted.typeId as number) : undefined;
                    };
                    // Create the matching `core_resource` row for a generated
                    // resource-backed PK.  The name is the entity's display label
                    // in `{subject}.dropdown.list`.
                    const ensureResourceRow = async (
                        idStr: string,
                        resourceKeyCol: string,
                    ): Promise<void> => {
                        const typeAlias = `${subject}.${object}`;
                        const typeId = await ensureType(typeAlias);
                        if (!typeId) return;
                        const name =
                            (typeof resourceName === 'string' && resourceName) ||
                            nameColValue ||
                            `${subject}.${object}.${resourceKeyCol}`;
                        await qb('core_resource')
                            .insert({
                                resourceId: strToBinary(idStr),
                                resourceName: name,
                                typeId,
                            })
                            .onConflict()
                            .ignore();
                    };
                    // 1) Literal 'uuid' / 'ulid' default markers on id columns.
                    for (const colName of Object.keys(cols)) {
                        if (cols[colName] !== 'uuid' && cols[colName] !== 'ulid') continue;
                        const prop = properties?.[colName];
                        const marker = cols[colName] as 'uuid' | 'ulid';
                        if (!prop || propDefault(prop) !== marker) continue;
                        const idStr = marker === 'ulid' ? ulid() : crypto.randomUUID();
                        cols[colName] = strToBinary(idStr);
                        generatedKey = idStr;
                        if (foreignKeys?.[colName] === 'core.resource.resourceId') {
                            await ensureResourceRow(idStr, colName);
                        }
                    }
                    // 2) Resource-backed not-null PK (no default marker, e.g.
                    //    `type.uidNotNull()`) with no key supplied by the caller.
                    if (
                        !generatedKey &&
                        cols[keyName] == null &&
                        foreignKeys?.[keyName] === 'core.resource.resourceId'
                    ) {
                        const pkProp = properties?.[keyName];
                        if (!pkProp || !propDefault(pkProp)) {
                            generatedKey = crypto.randomUUID();
                            cols[keyName] = strToBinary(generatedKey);
                            await ensureResourceRow(generatedKey, keyName);
                        }
                    }
                    // Convert any string values for binary columns to Buffer
                    const insertCols = prepareInputParams(cols, binaryCols, table);
                    const inserted = await qb(table).insert(insertCols);
                    // Select the inserted row back by the PK. Prefer the explicit
                    // key value (post-conversion) when the caller supplied one
                    // (e.g. a real ULID/UUID string) — `insertId` only works for
                    // auto-increment PKs and is 0 for a binary-PK table.
                    const masterKey =
                        generatedKey
                            ? strToBinary(generatedKey)
                            : (insertCols[keyName] as Buffer | string | undefined) ?? inserted[0];
                    const row = (await qb(table)
                        .where({[keyName]: masterKey})
                        .first()) as Record<string, unknown>;
                    const result: Record<string, unknown> = {
                        [object]: prepareResultRow(row, binaryCols, table),
                    };
                    // Master-detail: persist each sibling detail array (a param
                    // whose key names a FK-constrained detail table) with the
                    // master's key as the FK column, and return the created rows.
                    for (const [detailName, detailRows] of Object.entries(rest)) {
                        if (!Array.isArray(detailRows)) continue;
                        const detail = detailTables(subject, object, keyName).find(
                            d => d.table === `${subject}_${detailName}`,
                        );
                        if (!detail) continue;
                        const detailBinaryCols = getBinaryCols(this.config.context);
                        for (const detailRow of detailRows) {
                            await qb(detail.table).insert(
                                prepareInputParams(
                                    {
                                        ...(detailRow as Record<string, unknown>),
                                        [detail.fkColumn]: masterKey,
                                    },
                                    detailBinaryCols,
                                    detail.table,
                                ),
                            );
                        }
                        const createdRows = (await qb(detail.table).where({
                            [detail.fkColumn]: masterKey,
                        })) as Record<string, unknown>[];
                        result[detailName] = prepareResultRows(
                            createdRows,
                            detailBinaryCols,
                            detail.table,
                        );
                    }
                    // Graph-edge master-detail: persist each declared edge from
                    // its sibling array (filtering `granted !== false` when the
                    // binding uses the pivot convention) and attach the rows.
                    if (Buffer.isBuffer(masterKey)) {
                        const opts = tableOptions(objectSchema, this.config, subject, object);
                        for (const binding of opts.edges) {
                            if (!binding.table) continue; // reverse-only cleanup binding
                            const detailObject =
                                binding.object ??
                                binding.predicate.replace(/^has/, '').toLowerCase();
                            const edgeRows = Array.isArray(rest[detailObject])
                                ? (rest[detailObject] as Array<Record<string, unknown>>)
                                : [];
                            const objectKey = binding.objectKey ?? `${detailObject}Id`;
                            const ids = edgeRows
                                .filter(r => (binding.granted ? r.granted !== false : true))
                                .map(r => {
                                    const id = r[objectKey];
                                    return typeof id === 'string'
                                        ? strToBinary(id).toString('hex')
                                        : undefined;
                                })
                                .filter((x): x is string => !!x);
                            if (ids.length) {
                                await syncGraphEdges(qb, masterKey, binding.predicate, ids);
                            }
                            result[detailObject] = await attachEdgeRows(qb, masterKey, binding);
                        }
                    }
                    // Resource-backed: join the display name onto the master so
                    // the caller sees `${object}Name` in the created row.
                    if (opts.resource && Buffer.isBuffer(masterKey)) {
                        const masterRow = result[object] as Record<string, unknown> | undefined;
                        if (masterRow && typeof masterRow[`${object}Id`] === 'string') {
                            const [joined] = await joinResourceNames(
                                qb,
                                [masterRow],
                                `${object}Id`,
                                `${object}Name`,
                            );
                            result[object] = joined;
                        }
                    }
                    return result;
                }
                case 'edit': {
                    const {key: keyName = `${object}Id`, [object]: columns, ...rest} = params;
                    const qb = this.config.context.queryBuilder!;
                    const binaryCols = getBinaryCols(this.config.context);
                    const opts = tableOptions(objectSchema, this.config, subject, object);
                    const cols = columns as Record<string, unknown>;
                    const {[keyName]: key, ...update} = cols as Record<string, unknown>;
                    const isBinaryKey =
                        isBinaryColumn(binaryCols, table, keyName) && typeof key === 'string';
                    // Resource-backed: `${object}Name` is a virtual field — the
                    // display name lives in `core_resource.resourceName`, so
                    // rename that row instead of updating a table column.
                    const resourceName = opts.resource
                        ? (update[`${object}Name`] as string | undefined)
                        : undefined;
                    if (opts.resource) {
                        delete update[`${object}Name`];
                    }
                    // Convert any string values for binary columns to Buffer (the
                    // form round-trips them as base64 strings returned by `get`).
                    const preparedUpdate = prepareInputParams(update, binaryCols, table);
                    // Update using Buffer for binary keys
                    if (isBinaryKey) {
                        await qb(table).where(keyName, strToBinary(key)).update(preparedUpdate);
                    } else {
                        await qb(table)
                            .where({[keyName]: key})
                            .update(preparedUpdate);
                    }
                    if (
                        opts.resource &&
                        isBinaryKey &&
                        typeof resourceName === 'string' &&
                        resourceName
                    ) {
                        await qb('core_resource')
                            .where('resourceId', strToBinary(key))
                            .update({resourceName});
                    }
                    // Select back with Buffer → base64 conversion
                    let editQuery = qb(table);
                    if (isBinaryKey) {
                        editQuery = editQuery.where(keyName, strToBinary(key));
                    } else {
                        editQuery = editQuery.where({[keyName]: key});
                    }
                    const editRow = (await editQuery.first()) as Record<string, unknown>;
                    // Master-detail: replace each sibling detail array's rows for
                    // this master (delete existing, re-insert the payload rows).
                    const detailKey = isBinaryKey ? strToBinary(key) : key;
                    for (const [detailName, detailRows] of Object.entries(rest)) {
                        if (!Array.isArray(detailRows)) continue;
                        const detail = detailTables(subject, object, keyName).find(
                            d => d.table === `${subject}_${detailName}`,
                        );
                        if (!detail) continue;
                        const detailBinaryCols = getBinaryCols(this.config.context);
                        await qb(detail.table)
                            .where({[detail.fkColumn]: detailKey})
                            .del();
                        for (const detailRow of detailRows) {
                            await qb(detail.table).insert(
                                prepareInputParams(
                                    {
                                        ...(detailRow as Record<string, unknown>),
                                        [detail.fkColumn]: detailKey,
                                    },
                                    detailBinaryCols,
                                    detail.table,
                                ),
                            );
                        }
                    }
                    const result: Record<string, unknown> = {
                        [object]: prepareResultRow(editRow, binaryCols, table),
                    };
                    // Graph-edge master-detail: bring each declared edge in line
                    // with the submitted sibling array (when present) and re-attach
                    // the fresh edge rows to the result.
                    if (isBinaryKey) {
                        const masterKeyBuf = strToBinary(key);
                        for (const binding of opts.edges) {
                            if (!binding.table) continue; // reverse-only cleanup binding
                            const detailObject =
                                binding.object ??
                                binding.predicate.replace(/^has/, '').toLowerCase();
                            const edgeRows = Array.isArray(rest[detailObject])
                                ? (rest[detailObject] as Array<Record<string, unknown>>)
                                : undefined;
                            if (edgeRows !== undefined) {
                                const objectKey = binding.objectKey ?? `${detailObject}Id`;
                                const ids = edgeRows
                                    .filter(r => (binding.granted ? r.granted !== false : true))
                                    .map(r => {
                                        const id = r[objectKey];
                                        return typeof id === 'string'
                                            ? strToBinary(id).toString('hex')
                                            : undefined;
                                    })
                                    .filter((x): x is string => !!x);
                                await syncGraphEdges(qb, masterKeyBuf, binding.predicate, ids);
                            }
                            result[detailObject] = await attachEdgeRows(qb, masterKeyBuf, binding);
                        }
                    }
                    return result;
                }
                case 'remove': {
                    const {key: keyName = `${object}Id`, [keyName]: key} = params;
                    if (!(keyName in params)) {
                        throw this.error(_errors['knex.missingKey']({key: keyName}), $meta);
                    }
                    const binaryCols = getBinaryCols(this.config.context);
                    const opts = tableOptions(objectSchema, this.config, subject, object);
                    const isBinaryKey =
                        isBinaryColumn(binaryCols, table, keyName) && typeof key === 'string';
                    const masterKey = isBinaryKey ? strToBinary(key as string) : key;
                    if (!masterKey) {
                        throw this.error(_errors['knex.missingKey']({key: keyName}), $meta);
                    }
                    const qb = this.config.context.queryBuilder!;
                    // Master-detail: delete each FK-constrained detail table's
                    // rows for this master BEFORE deleting the master row, so a
                    // non-cascading FK does not block the delete.
                    for (const detail of detailTables(subject, object, keyName)) {
                        await qb(detail.table)
                            .where({[detail.fkColumn]: masterKey})
                            .del();
                    }
                    // Graph edges: delete the subject's own edges and (when the
                    // binding declares `reverse`) the edges pointing AT it.
                    if (Buffer.isBuffer(masterKey)) {
                        const subjectBuf = masterKey as Buffer;
                        for (const binding of opts.edges) {
                            await qb('core_triple')
                                .where('subjectId', subjectBuf)
                                .where('predicateName', binding.predicate)
                                .del();
                            if (binding.reverse) {
                                await qb('core_triple')
                                    .where('objectId', subjectBuf)
                                    .where('predicateName', binding.predicate)
                                    .del();
                            }
                        }
                        if (opts.edges.length) {
                            await qb.raw('CALL access_pathRefresh()');
                        }
                    }
                    // Entity row first — its PK is a FK to `core_resource`, so
                    // the resource row must be deleted only after the entity row.
                    const removed = isBinaryKey
                        ? await qb(table).where(keyName, masterKey).del()
                        : await qb(table)
                              .where({[keyName]: key})
                              .del();
                    // Resource-backed: delete the `core_resource` row last.
                    if (Buffer.isBuffer(masterKey) && opts.resource) {
                        await qb('core_resource').where('resourceId', masterKey).del();
                    }
                    return removed;
                }
                case 'merge': {
                    const {key = `${object}Id`, [object]: objectRows, resourceType} = params;
                    let rows = objectRows as Array<{[key]: string}>;
                    const binaryCols = getBinaryCols(this.config.context);
                    if (resourceType) {
                        // create or lookup resourceId for each row based on its `name` property
                        const typeId = (
                            await this.config.context.queryBuilder!('core_type')
                                .where({typeAlias: resourceType})
                                .first('typeId')
                        )?.typeId;
                        if (!typeId) {
                            throw this.error(
                                _errors['knex.notFound']({
                                    message: `Resource type not found: ${resourceType}`,
                                }),
                                $meta,
                            );
                        }
                        const resources = (
                            await this.config.context.queryBuilder!('core_resource')
                                .join('core_type', 'core_resource.typeId', 'core_type.typeId')
                                .where('core_type.typeAlias', resourceType)
                                .whereIn(
                                    'core_resource.resourceName',
                                    rows.map(r => r.name).filter(Boolean),
                                )
                                .select('resourceId', 'resourceName')
                        ).reduce(
                            (acc, row) => {
                                acc[row.resourceName] = row.resourceId;
                                return acc;
                            },
                            {} as Record<string, string>,
                        );
                        const newResources = [];
                        for (const row of rows) {
                            if (row.name) {
                                let resourceId = resources[row.name];
                                if (!resourceId) {
                                    resourceId = Buffer.alloc(16);
                                    v4(undefined, resourceId);
                                    newResources.push({resourceId, resourceName: row.name, typeId});
                                    row[key] = resourceId;
                                } else {
                                    row[key] = resourceId;
                                }
                            }
                        }
                        if (newResources.length > 0)
                            await this.config.context.queryBuilder!('core_resource').insert(
                                newResources,
                            );
                        rows = rows.map(({name: _, ...row}) => row);
                    }
                    // Convert string values for binary columns to Buffer before insert
                    const preparedRows = rows.map(row =>
                        prepareInputParams(row, binaryCols, table),
                    );
                    return this.config.context.queryBuilder!(table)
                        .insert(preparedRows)
                        .onConflict(key)
                        .merge();
                }
                case 'insert': {
                    const binaryCols = getBinaryCols(this.config.context);
                    return this.config.context.queryBuilder!(table).insert(
                        prepareInputParams(params, binaryCols, table),
                    );
                }
                case 'update': {
                    const {select: _select, ...where} = params;
                    const binaryCols = getBinaryCols(this.config.context);
                    return this.config.context.queryBuilder!(table)
                        .where(
                            prepareInputParams(where as Record<string, unknown>, binaryCols, table),
                        )
                        .update(_select);
                }
                case 'delete': {
                    const binaryCols = getBinaryCols(this.config.context);
                    return this.config.context.queryBuilder!(table)
                        .where(prepareInputParams(params, binaryCols, table))
                        .del();
                }
            }
            throw this.error(_errors['knex.generic']({}), $meta);
        },
        /**
         * `{subject}.dropdown.list` — produce `{value, label}` pairs for every
         * resource-backed table of the subject.  A table is resource-backed when
         * its PK (or any column) is a FK to `core.resource.resourceId`.
         *
         * Entries are resolved directly from `core_resource` (joined with
         * `core_type` by `typeAlias = ${subject}.${object}`), so every realm gets
         * dropdowns for free, matching the `blong-mock` `{subject}.dropdown.list`
         * shape (`{value: base64, label: resourceName}`).
         *
         * Per-table overrides are declared via the `dropdown` option on the table
         * spec (see `ISchemaTable`): `typeAlias`, `joinTable`, `joinColumn`,
         * `labelColumn`.
         */
        async _dropdownList(
            this: Adapter<IConfig>,
            subject: string,
        ): Promise<Record<string, Array<{value: string; label: string}>>> {
            const qb = this.config.context?.queryBuilder;
            if (!qb) return {};
            const result: Record<string, Array<{value: string; label: string}>> = {};
            const tables = this.config.schema?.tables ?? {};
            for (const [tableName, tableConfig] of Object.entries(tables)) {
                const [s, object] = tableName.split('.');
                if (s !== subject) continue;
                const {definition, dropdown} = resolveTableSpec(
                    objectSchema,
                    tableConfig,
                    s,
                    object,
                );
                if (!definition) continue;
                // Resource-backed?  Any FK pointing at core.resource.resourceId.
                const foreign = (
                    definition as unknown as {
                        constraints?: {foreign?: Record<string, string | {references?: string}>};
                    }
                )?.constraints?.foreign;
                const isResourceBacked = Object.entries(foreign ?? {}).some(([, fk]) =>
                    typeof fk === 'string'
                        ? fk === 'core.resource.resourceId'
                        : fk?.references === 'core.resource.resourceId',
                );
                if (!isResourceBacked) continue;
                const typeAlias = dropdown?.typeAlias ?? `${s}.${object}`;
                const labelColumn = dropdown?.labelColumn ?? 'resourceName';
                let query = qb('core_resource as r')
                    .join('core_type as t', 't.typeId', 'r.typeId')
                    .where('t.typeAlias', typeAlias)
                    .select('r.resourceId', `r.${labelColumn} as label`);
                if (dropdown?.joinTable) {
                    const joinColumn = dropdown.joinColumn ?? `${object}Id`;
                    query = query.join(
                        dropdown.joinTable,
                        `${dropdown.joinTable}.${joinColumn}`,
                        'r.resourceId',
                    );
                }
                const rows = (await query) as Array<{resourceId: Buffer; label: string}>;
                result[`${s}.${object}`] = rows.map(r => ({
                    value: r.resourceId.toString('base64'),
                    label: r.label,
                }));
            }
            return result;
        },
        /**
         * Load model mocks when `config.mock` is `true`
         */
        async createHandlers({
            handlers,
            layerApi,
            kind,
        }: {
            handlers: object;
            layerApi: IHandlerProxy<unknown>;
            kind: string;
        }) {
            if (this.config?.mock && kind === 'model') {
                const {mock} = await import('@feasibleone/blong-mock');
                const models = await Promise.all(
                    Object.values(handlers)
                        .filter(handler => {
                            if (typeof this.config?.mock === 'boolean') return this.config.mock;
                            const handlerName = handler.name;
                            if (typeof this.config?.mock?.[handlerName] === 'boolean')
                                return this.config.mock[handlerName];
                            return Object.values(
                                this.config?.mock as Record<string, boolean | RegExp>,
                            ).some(
                                pattern => pattern instanceof RegExp && pattern.test(handlerName),
                            );
                        })
                        .map(model => model()),
                );
                return await mock.apply(this, [models, layerApi]);
            }
        },
        /**
         * Create or synchronise a database table from a TypeBox `TObject` schema.
         */
        async schemaTableSync(
            this: Adapter<IConfig>,
            tableName: string,
            schema: TObject,
            options: {dropColumns?: boolean} = {},
        ): Promise<{created: boolean; added: string[]; dropped: string[]}> {
            if (!this.config.context?.queryBuilder)
                throw new Error('Knex queryBuilder not available');
            return schemaTableSyncImpl(
                this.config.context.queryBuilder!,
                tableName,
                schema,
                options,
            );
        },
        /**
         * Synchronise stored procedures to the database.
         *
         * Accepts either a directory path (all `.sql` files are loaded) or an
         * array of `{name, sql}` objects.  Only procedures whose body differs
         * from the current definition are re-created.
         */
        async schemaProcedureSync(
            this: Adapter<IConfig>,
            procedures: string | Array<{name: string; sql: string}>,
        ): Promise<{created: string[]; skipped: string[]}> {
            if (!this.config.context?.queryBuilder)
                throw new Error('Knex queryBuilder not available');
            return schemaProcedureSyncImpl(this.config.context.queryBuilder!, procedures);
        },
        /**
         * Discover stored procedures whose names start with `namespace` and
         * generate a callable handler function and TypeBox schema for each.
         * Procedures starting with `_` are excluded.
         */
        async schemaProcedureBind(
            this: Adapter<IConfig>,
            namespace: string,
            schema?: string,
        ): Promise<{
            handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
            schemas: Record<string, TFunction>;
        }> {
            if (!this.config.context?.queryBuilder)
                throw new Error('Knex queryBuilder not available');
            return schemaProcedureBindImpl(this.config.context.queryBuilder!, namespace, schema);
        },
        /**
         * Bind a map of handler functions as synthetic own-property handlers.
         * Each handler is stored under its `methodId` key AND its camelCase name
         * (for `super` calls in object-form realm handler overrides).
         */
        schemaHandlersBind(
            this: Adapter<IConfig>,
            handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>,
        ): void {
            attachHandlers(this as unknown as Record<string, unknown>, handlers);
        },
    };
});

/**
 * Process asset modules matching the given regex pattern.
 * Iterates over all realm asset modules, reads YAML/JSON files and dispatches
 * their contents as handler method calls.
 */
async function processSeedAssets(
    ctx: Adapter<IConfig>,
    pattern: RegExp,
    onProgress?: (name: string) => void,
): Promise<void> {
    for (const realm of (await ctx.attach?.(
        pattern,
        [] as Array<{
            assets: Record<string, string>;
        }>,
    )) ?? []) {
        if (!realm?.assets) continue;
        for (const [name, path] of Object.entries<string>(realm.assets).sort(([, a], [, b]) =>
            ctx.platform.basename(a).localeCompare(ctx.platform.basename(b)),
        )) {
            const extname = ctx.platform.extname(path);
            const method = methodParts(ctx.platform.basename(path, extname).split('-').pop()!);
            onProgress?.(name);
            ctx.log?.debug?.({
                $meta: {mtid: 'event', method},
                message: `Processing asset: ${name} at path: ${path}`,
            });
            if (extname === '.yaml' || extname === '.yml') {
                const params = yaml.parse(
                    ctx.platform
                        .readFileSync(path.startsWith('file://') ? path.slice(7) : path, {
                            encoding: 'utf-8',
                        })
                        .toString('utf-8'),
                );
                await ctx.handle!(params, {method});
            } else if (extname === '.json') {
                const params = JSON.parse(
                    ctx.platform
                        .readFileSync(path.startsWith('file://') ? path.slice(7) : path, {
                            encoding: 'utf-8',
                        })
                        .toString('utf-8'),
                );
                await ctx.handle!(params, {method});
            }
        }
    }
}

export {attachHandlers, methodId, snakeToCamel};

/** Resolved per-table CRUD options (resource-backed + graph-edge bindings). */
export interface IResolvedTableOptions {
    /** Whether the table is resource-backed (PK → `core.resource`). */
    resource: boolean;
    /** Declarative graph-edge master-detail bindings. */
    edges: IEdgeBinding[];
}

/**
 * Resolve a `schema.tables` entry into its definition + dropdown override.
 *
 * A table entry is one of:
 * - a plain order number → definition from `objectSchema[subject][object]`
 * - an `ISchemaTable` spec `{definition?, order?, dropdown?, resource?, edges?}`
 *   — definition falls back to `objectSchema[subject][object]`
 * - a bare TypeBox `TObject`
 */
function resolveTableSpec(
    objectSchema: IObjectSchema,
    tableConfig: number | ISchemaTable | TObject | undefined,
    subject: string,
    object: string,
): {
    definition?: TObject;
    dropdown?: ISchemaTable['dropdown'];
    resource?: boolean;
    edges?: IEdgeBinding[];
} {
    if (tableConfig === undefined) return {};
    if (typeof tableConfig === 'number') {
        return {definition: objectSchema[subject]?.[object]};
    }
    if (typeof tableConfig === 'object' && tableConfig !== null) {
        // An ISchemaTable spec — either with an explicit `definition`, or a
        // partial spec (e.g. only `{order, dropdown}`) that falls back to the
        // realm schema for its definition.
        if (
            'definition' in tableConfig ||
            'order' in tableConfig ||
            'dropdown' in tableConfig ||
            'resource' in tableConfig ||
            'edges' in tableConfig
        ) {
            const spec = tableConfig as ISchemaTable;
            return {
                definition: spec.definition ?? objectSchema[subject]?.[object],
                dropdown: spec.dropdown,
                resource: spec.resource,
                edges: spec.edges,
            };
        }
        return {definition: tableConfig as TObject};
    }
    return {};
}

/**
 * Resolve the declarative CRUD options for `subject.object` from the schema
 * table config. Tables declared with `resource: true` (or an `edges` binding)
 * get the resource-backed + graph-edge generic behaviour.
 */
function tableOptions(
    objectSchema: IObjectSchema,
    config: {schema?: {tables?: Record<string, number | ISchemaTable | TObject>}} | undefined,
    subject: string,
    object: string,
): IResolvedTableOptions {
    const tableConfig = config?.schema?.tables?.[`${subject}.${object}`];
    const spec =
        tableConfig !== undefined
            ? resolveTableSpec(objectSchema, tableConfig, subject, object)
            : {};
    const edges = spec.edges ?? [];
    return {
        resource: spec.resource === true || edges.length > 0,
        edges,
    };
}

/**
 * Batched join of `core_resource.resourceName` onto rows as the given name
 * field (e.g. `roleName`). Row ids are base64/hex strings (post
 * `prepareResultRow`); rows that already carry the name field are left as-is.
 */
async function joinResourceNames(
    qb: Knex,
    rows: Record<string, unknown>[],
    idField: string,
    nameField: string,
): Promise<Record<string, unknown>[]> {
    if (!rows.length) return rows;
    const ids = rows
        .map(r => (typeof r[idField] === 'string' ? (r[idField] as string) : undefined))
        .filter((x): x is string => !!x);
    if (!ids.length) return rows;
    const found = (await qb('core_resource')
        .whereIn(
            'resourceId',
            ids.map(id => strToBinary(id)),
        )
        .select('resourceId', 'resourceName')) as Array<{resourceId: Buffer; resourceName: string}>;
    const names = new Map<string, string>();
    for (const r of found) names.set(r.resourceId.toString('hex'), r.resourceName);
    return rows.map(row => {
        if (row[nameField] !== undefined) return row;
        const id = typeof row[idField] === 'string' ? (row[idField] as string) : undefined;
        if (!id) return row;
        const name = names.get(strToBinary(id).toString('hex'));
        return name !== undefined ? ({...row, [nameField]: name} as Record<string, unknown>) : row;
    });
}

/**
 * The hex object ids of a subject's graph edges (`core_triple`).
 */
async function edgeObjectIds(qb: Knex, subjectId: Buffer, predicate: string): Promise<string[]> {
    const rows = (await qb('core_triple')
        .where('subjectId', subjectId)
        .where('predicateName', predicate)
        .select('objectId')) as Array<{objectId: Buffer}>;
    return rows.map(r => r.objectId.toString('hex'));
}

/**
 * Bring `subjectId -predicate-> objectId` edges in line with `objectHexIds`
 * (add missing, delete stale, refresh `access_path` once).
 */
async function syncGraphEdges(
    qb: Knex,
    subjectId: Buffer,
    predicate: string,
    objectHexIds: string[],
): Promise<void> {
    const existing = await edgeObjectIds(qb, subjectId, predicate);
    const existingSet = new Set(existing);
    const target = new Set(objectHexIds);
    const toAdd = objectHexIds.filter(id => !existingSet.has(id));
    const toRemove = existing.filter(id => !target.has(id));
    if (!toAdd.length && !toRemove.length) return;
    await qb.transaction(async trx => {
        if (toAdd.length) {
            await trx('core_triple').insert(
                toAdd.map(objectId => ({
                    subjectId,
                    predicateName: predicate,
                    objectId: Buffer.from(objectId, 'hex'),
                })),
            );
        }
        if (toRemove.length) {
            await trx('core_triple')
                .where('subjectId', subjectId)
                .where('predicateName', predicate)
                .whereIn(
                    'objectId',
                    toRemove.map(id => Buffer.from(id, 'hex')),
                )
                .del();
        }
        await trx.raw('CALL access_pathRefresh()');
    });
}

/**
 * Attach a graph-edge binding's rows to a result as a sibling array: the edge
 * object rows joined with their resource name (and a `granted: true` marker
 * when the binding uses the `granted` pivot convention).
 */
async function attachEdgeRows(
    qb: Knex,
    subjectId: Buffer,
    binding: IEdgeBinding,
): Promise<Record<string, unknown>[]> {
    const object = binding.object ?? binding.predicate.replace(/^has/, '').toLowerCase();
    const objectKey = binding.objectKey ?? `${object}Id`;
    const nameField = binding.nameField ?? `${object}Name`;
    const ids = await edgeObjectIds(qb, subjectId, binding.predicate);
    if (!ids.length) return [];
    const rows = (await qb(binding.table)
        .whereIn(
            objectKey,
            ids.map(hex => Buffer.from(hex, 'hex')),
        )
        .select('*')) as Record<string, unknown>[];
    // Prepare binary keys to base64 before joining names — joinResourceNames
    // expects string ids (base64/hex), not Buffers.
    const prepared = rows.map(row => ({
        ...row,
        [objectKey]: binaryToStr(row[objectKey] as Buffer),
    }));
    const named = await joinResourceNames(qb, prepared, objectKey, nameField);
    return named.map(row => (binding.granted ? {...row, granted: true} : row));
}
