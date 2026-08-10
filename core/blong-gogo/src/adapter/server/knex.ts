import {
    adapter,
    type Adapter,
    type Errors,
    type IErrorMap,
    type IHandlerProxy,
    type IMeta,
    type Knex,
} from '@feasibleone/blong/types';
import KnexLib from 'knex';
import crypto from 'node:crypto';
import {type TFunction, type TObject} from 'typebox';
import {v4} from 'uuid';
import yaml from 'yaml';
import {methodParts} from '../../lib.ts';
import {
    discoverBinaryColumns,
    isBinaryColumn,
    prepareInputParams,
    prepareResultRow,
    prepareResultRows,
    strToBinary,
} from '../schema/knex/binary.ts';
import {wrapKnex} from '../schema/knex/json.ts';
import {
    bindSyntheticHandlers,
    schemaProcedureBindImpl,
    schemaProcedureSyncImpl,
} from '../schema/knex/schemaMysql.ts';
import {
    attachHandlers,
    schemaCrudBindImpl,
    schemaTableConstraintSyncImpl,
    schemaTableSyncImpl,
} from '../schema/knex/schemaTable.ts';
import {type IConfig, type ISchemaTable, type ITableConstraints} from '../schema/knex/types.ts';
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

export default adapter<IConfig>(({utError, schema: objectSchema}) => {
    _errors ||= utError.register(errorMap);

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
        start() {
            this.config.context = {
                queryBuilder: wrapKnex(KnexLib(this.config.knex)) as unknown as Knex,
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
                    const orderA =
                        typeof a === 'number'
                            ? a
                            : typeof a === 'object' && 'definition' in a
                              ? ((a as ISchemaTable).order ?? 0)
                              : 0;
                    const orderB =
                        typeof b === 'number'
                            ? b
                            : typeof b === 'object' && 'definition' in b
                              ? ((b as ISchemaTable).order ?? 0)
                              : 0;
                    return orderA - orderB;
                });
                const dropColumns = schema.dropColumns ?? false;
                const tableDefs: Array<{tableName: string; definition: TObject}> = [];
                for (const [tableName, tableConfig] of tables) {
                    const isOrder = typeof tableConfig === 'number';
                    const isSpec = typeof tableConfig === 'object' && 'definition' in tableConfig;
                    const [subject, object] = tableName.split('.');
                    const definition = isOrder
                        ? objectSchema[subject]?.[object]
                        : isSpec
                          ? (tableConfig as ISchemaTable).definition
                          : (tableConfig as TObject);
                    const sqlName = tableName.replaceAll('.', '_');
                    await schemaTableSyncImpl(knex, sqlName, definition, {
                        dropColumns,
                    });
                    tableDefs.push({tableName: sqlName, definition});
                }
                // Second pass: apply constraints (PKs, unique, indexes, FKs) now
                // that all tables exist.
                for (const {tableName: sqlName, definition} of tableDefs) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const constraints = (definition as any).constraints as
                        | ITableConstraints
                        | undefined;
                    if (constraints)
                        await schemaTableConstraintSyncImpl(knex, sqlName, constraints);
                }
                // Collect procedure definitions: scanned folders first, then inline.
                const procedureDefs: Array<{name: string; sql: string}> = [];
                for (const folder of schema.procedurePaths ?? [])
                    procedureDefs.push(...readSqlFiles(folder));
                for (const [name, sql] of Object.entries(schema.procedures ?? {}))
                    procedureDefs.push({name, sql});
                if (procedureDefs.length > 0) await schemaProcedureSyncImpl(knex, procedureDefs);
            }

            if (schema && knex) {
                // Bind all DB procedures as synthetic handlers (skips `_`-prefixed).
                await bindSyntheticHandlers(self, knex);
                // Auto-bind CRUD handlers for each declared table when namespace is set.
                // const namespace = this.config.namespace;
                // if (namespace) {
                //     const tableDefs = Object.entries(schema.tables ?? {}).map(
                //         ([tableName, tableConfig]) => {
                //             const isOrder = typeof tableConfig === 'number';
                //             const isSpec =
                //                 typeof tableConfig === 'object' && 'definition' in tableConfig;
                //             const [subject, object] = tableName.split('.');
                //             const definition = isOrder
                //                 ? objectSchema[subject]?.[object]
                //                 : isSpec
                //                   ? (tableConfig as ISchemaTable).definition
                //                   : (tableConfig as TObject);
                //             return {tableName, definition};
                //         },
                //     );
                //     await bindSyntheticCrud(self, knex, namespace, tableDefs);
                // }
            }
            if (schema?.seed) {
                // 1. Process production seeds (db.asset modules)
                await processSeedAssets(this, /\.db\.asset$/);
                // 2. Process test seeds (dbTest.asset modules) only when dbTest is enabled
                if (schema?.dbTest) {
                    await processSeedAssets(this, /\.dbTest\.asset$/);
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
            this.config.knex = newKnexConfig as object;
            this.config.context = {
                queryBuilder: wrapKnex(KnexLib(newKnexConfig as object)) as unknown as Knex,
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
            const table = `${subject}_${object}`;
            switch (operation) {
                case 'get': {
                    const {select: _select, ...where} = params;
                    const qb = this.config.context.queryBuilder!;
                    const binaryCols = getBinaryCols(this.config.context);
                    let query = qb(table);
                    for (const [key, val] of Object.entries(where)) {
                        if (isBinaryColumn(binaryCols, table, key) && typeof val === 'string') {
                            query = query.where(key, strToBinary(val));
                        } else {
                            query = query.where(key, val as string | number);
                        }
                    }
                    const row = (await query.first()) as Record<string, unknown> | undefined;
                    return {[object]: prepareResultRow(row, binaryCols, table)};
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
                    return prepareResultRows(rows, binaryCols, table);
                }
                case 'add': {
                    const {key: keyName = `${object}Id`, [object]: columns} = params;
                    const definition = objectSchema[subject]?.[object] as unknown as
                        | Record<string, unknown>
                        | undefined;
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
                    const cols = columns as Record<string, unknown>;
                    // Generate real UUIDs for type.uuid() columns that have the
                    // literal default value 'uuid'.  Track generated UUIDs so we
                    // can select back the inserted row by UUID.
                    let generatedKey: string | undefined;
                    for (const colName of Object.keys(cols)) {
                        if (cols[colName] !== 'uuid') continue;
                        const prop = properties?.[colName];
                        if (!prop || propDefault(prop) !== 'uuid') continue;
                        const uuidStr = crypto.randomUUID();
                        cols[colName] = strToBinary(uuidStr);
                        generatedKey = uuidStr;
                        // If this PK is also a FK to core.resource, create the
                        // corresponding core_resource row.
                        if (foreignKeys?.[colName] === 'core.resource.resourceId') {
                            const typeAlias = `${subject}.${object}`;
                            const typeRow = await qb('core_type')
                                .where({typeAlias})
                                .first('typeId');
                            if (typeRow) {
                                await qb('core_resource')
                                    .insert({
                                        resourceId: strToBinary(uuidStr),
                                        resourceName: `${subject}.${object}.${colName}`,
                                        typeId: typeRow.typeId,
                                    })
                                    .onConflict()
                                    .ignore();
                            }
                        }
                    }
                    // Convert any string values for binary columns to Buffer
                    const insertCols = prepareInputParams(cols, binaryCols, table);
                    const inserted = await qb(table).insert(insertCols);
                    const row = (await qb(table)
                        .where({[keyName]: generatedKey ? strToBinary(generatedKey) : inserted[0]})
                        .first()) as Record<string, unknown>;
                    return {[object]: prepareResultRow(row, binaryCols, table)};
                }
                case 'edit': {
                    const {key: keyName = `${object}Id`, [object]: columns} = params;
                    const qb = this.config.context.queryBuilder!;
                    const binaryCols = getBinaryCols(this.config.context);
                    const cols = columns as Record<string, unknown>;
                    const {[keyName]: key, ...update} = cols as Record<string, unknown>;
                    const isBinaryKey =
                        isBinaryColumn(binaryCols, table, keyName) && typeof key === 'string';
                    // Update using Buffer for binary keys
                    if (isBinaryKey) {
                        await qb(table).where(keyName, strToBinary(key)).update(update);
                    } else {
                        await qb(table)
                            .where({[keyName]: key})
                            .update(update);
                    }
                    // Select back with Buffer → base64 conversion
                    let editQuery = qb(table);
                    if (isBinaryKey) {
                        editQuery = editQuery.where(keyName, strToBinary(key));
                    } else {
                        editQuery = editQuery.where({[keyName]: key});
                    }
                    const editRow = (await editQuery.first()) as Record<string, unknown>;
                    return {[object]: prepareResultRow(editRow, binaryCols, table)};
                }
                case 'remove': {
                    const {key: keyName = `${object}Id`, [keyName]: key} = params;
                    if (!(keyName in params)) {
                        throw this.error(_errors['knex.missingKey']({key: keyName}), $meta);
                    }
                    const binaryCols = getBinaryCols(this.config.context);
                    const isBinaryKey =
                        isBinaryColumn(binaryCols, table, keyName) && typeof key === 'string';
                    if (isBinaryKey) {
                        return this.config.context.queryBuilder!(table)
                            .where(keyName, strToBinary(key))
                            .del();
                    }
                    return this.config.context.queryBuilder!(table)
                        .where({[keyName]: key})
                        .del();
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
         * Generate CRUD handler functions and their TypeBox schemas for a given
         * table.  Only operations absent from `existingHandlers` are generated.
         */
        async schemaCrudBind(
            this: Adapter<IConfig>,
            subject: string,
            objectName: string,
            schema: TObject,
            existingHandlers: string[] = [],
            tableName?: string,
        ): Promise<{
            handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;
            schemas: Record<string, TFunction>;
        }> {
            if (!this.config.context?.queryBuilder)
                throw new Error('Knex queryBuilder not available');
            return schemaCrudBindImpl(
                this.config.context.queryBuilder!,
                subject,
                objectName,
                schema,
                existingHandlers,
                tableName,
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
async function processSeedAssets(ctx: Adapter<IConfig>, pattern: RegExp): Promise<void> {
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
