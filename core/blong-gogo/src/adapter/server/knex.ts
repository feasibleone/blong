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
                    // 1. Process production seeds (db.asset modules)
                    await processSeedAssets(this, /\.db\.asset$/);
                    // 2. Process test seeds (dbTest.asset modules) only when dbTest is enabled
                    if (schema?.dbTest) {
                        await processSeedAssets(this, /\.dbTest\.asset$/);
                    }
                    // 3. Single rebuild after all seed edges are in place.
                    if (schema?.accessPathRefresh) await knex?.raw('CALL access_pathRefresh()');
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
                    const {key: keyName = `${object}Id`, [object]: columns, resourceName} = params;
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
                                // Use a meaningful resourceName when available:
                                // an explicit `resourceName` param, else the
                                // `${object}Name` column value, else the synthetic
                                // name.  The name is the entity's display label in
                                // `{subject}.dropdown.list`.
                                const name =
                                    (typeof resourceName === 'string' && resourceName) ||
                                    (typeof cols[`${object}Name`] === 'string'
                                        ? (cols[`${object}Name`] as string)
                                        : undefined) ||
                                    `${subject}.${object}.${colName}`;
                                await qb('core_resource')
                                    .insert({
                                        resourceId: strToBinary(uuidStr),
                                        resourceName: name,
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

/**
 * Resolve a `schema.tables` entry into its definition + dropdown override.
 *
 * A table entry is one of:
 * - a plain order number → definition from `objectSchema[subject][object]`
 * - an `ISchemaTable` spec `{definition?, order?, dropdown?}` — definition
 *   falls back to `objectSchema[subject][object]`
 * - a bare TypeBox `TObject`
 */
function resolveTableSpec(
    objectSchema: IObjectSchema,
    tableConfig: number | ISchemaTable | TObject,
    subject: string,
    object: string,
): {definition?: TObject; dropdown?: ISchemaTable['dropdown']} {
    if (typeof tableConfig === 'number') {
        return {definition: objectSchema[subject]?.[object]};
    }
    if (typeof tableConfig === 'object' && tableConfig !== null) {
        // An ISchemaTable spec — either with an explicit `definition`, or a
        // partial spec (e.g. only `{order, dropdown}`) that falls back to the
        // realm schema for its definition.
        if ('definition' in tableConfig || 'order' in tableConfig || 'dropdown' in tableConfig) {
            const spec = tableConfig as ISchemaTable;
            return {
                definition: spec.definition ?? objectSchema[subject]?.[object],
                dropdown: spec.dropdown,
            };
        }
        return {definition: tableConfig as TObject};
    }
    return {};
}
