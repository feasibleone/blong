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
import {type TFunction, type TObject} from 'typebox';
import yaml from 'yaml';
import {methodParts} from '../../lib.ts';
import {
    bindSyntheticHandlers,
    schemaProcedureBindImpl,
    schemaProcedureSyncImpl,
} from '../schema/knex/schemaMysql.ts';
import {
    attachHandlers,
    schemaCrudBindImpl,
    schemaTableSyncImpl,
} from '../schema/knex/schemaTable.ts';
import {type IConfig, type ISchemaTable} from '../schema/knex/types.ts';
import {methodId, propType, readSqlFiles, snakeToCamel} from '../schema/knex/utils.ts';

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
            this.config.context = {queryBuilder: KnexLib(this.config.knex) as unknown as Knex};
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
                for (const [tableName, tableConfig] of tables) {
                    const isOrder = typeof tableConfig === 'number';
                    const isSpec = typeof tableConfig === 'object' && 'definition' in tableConfig;
                    const [subject, object] = tableName.split('.');
                    const definition = isOrder
                        ? objectSchema[subject]?.[object]
                        : isSpec
                          ? (tableConfig as ISchemaTable).definition
                          : (tableConfig as TObject);
                    await schemaTableSyncImpl(knex, tableName.replaceAll('.', '_'), definition, {
                        dropColumns,
                    });
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
                for (const [name, path] of Object.entries<string>(
                    (
                        await (
                            this.link as (
                                ...args: unknown[]
                            ) => Promise<{assets: Record<string, string>}>
                        )(/\.db\.asset$/, {})
                    ).assets ?? {},
                )) {
                    const extname = this.platform.extname(path);
                    const method = methodParts(this.platform.basename(path, extname));
                    this.log?.debug?.({
                        $meta: {mtid: 'event', method},
                        message: `Processing asset: ${name} at path: ${path}`,
                    });
                    if (extname === '.yaml' || extname === '.yml') {
                        const params = yaml.parse(
                            this.platform
                                .readFileSync(path.startsWith('file://') ? path.slice(7) : path, {
                                    encoding: 'utf-8',
                                })
                                .toString('utf-8'),
                        );
                        await this.handle!(params, {method});
                    } else if (extname === '.json') {
                        const params = JSON.parse(
                            this.platform
                                .readFileSync(path.startsWith('file://') ? path.slice(7) : path, {
                                    encoding: 'utf-8',
                                })
                                .toString('utf-8'),
                        );
                        await this.handle!(params, {method});
                    }
                }
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
                queryBuilder: KnexLib(newKnexConfig as object) as unknown as Knex,
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
                    const {select = '*', ...where} = params;
                    return {
                        [object]: await this.config.context.queryBuilder!(table)
                            .where(where)
                            .first(select),
                    };
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
                    let result = this.config.context.queryBuilder!(table).where({
                        ...filterBy,
                        ...where,
                    });
                    if (search) {
                        const stringFields = Object.entries(
                            objectSchema[subject]?.[object]?.properties ?? {},
                        )
                            .filter(([, prop]) => propType(prop) === 'string')
                            .map(([key]) => key);
                        if (stringFields.length > 0)
                            result = result.andWhere(function () {
                                for (const field of stringFields) {
                                    this.orWhereILike(field, `%${search}%`);
                                }
                            });
                    }
                    if (order) result = result.orderBy(order);
                    if (limit) result = result.limit(limit);
                    if (offset) result = result.offset(offset);
                    return result.select(select);
                }
                case 'add': {
                    const {key: keyName = `${object}Id`, [object]: columns} = params;
                    const inserted = await this.config.context.queryBuilder!(table).insert(columns);
                    return {
                        [object]: await this.config.context.queryBuilder!(table)
                            .where({[keyName]: inserted[0]})
                            .first('*'),
                    };
                }
                case 'edit': {
                    const {key: keyName = `${object}Id`, [object]: columns} = params;
                    const {[keyName]: key, ...update} = columns as Record<string, unknown>;
                    await this.config.context.queryBuilder!(table)
                        .where({[keyName]: key})
                        .update(update);
                    return {
                        [object]: await this.config.context.queryBuilder!(table)
                            .where({[keyName]: key})
                            .first('*'),
                    };
                }
                case 'remove': {
                    const {key: keyName = `${object}Id`, [keyName]: key} = params;
                    if (!(keyName in params)) {
                        throw this.error(_errors['knex.missingKey']({key: keyName}), $meta);
                    }
                    return this.config.context.queryBuilder!(table)
                        .where({[keyName]: key})
                        .del();
                }
                case 'merge': {
                    const {key = `${object}Id`, [object]: columns} = params;
                    return this.config.context.queryBuilder!(table)
                        .insert(columns)
                        .onConflict(key)
                        .merge();
                }
                case 'insert':
                    return this.config.context.queryBuilder!(table).insert(params);
                case 'update': {
                    const {select = '*', ...where} = params;
                    return this.config.context.queryBuilder!(table).where(where).update(select);
                }
                case 'delete':
                    return this.config.context.queryBuilder!(table).where(params).del();
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

export {attachHandlers, methodId, snakeToCamel};
