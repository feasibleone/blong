import {
    adapter,
    type Adapter,
    type Errors,
    type IErrorMap,
    type IMeta,
    type Knex,
} from '@feasibleone/blong/types';
import KnexLib from 'knex';
import {type TFunction, type TObject} from 'typebox';
import {
    bindSyntheticCrud,
    bindSyntheticHandlers,
    schemaProcedureBindImpl,
    schemaProcedureSyncImpl,
} from './knex/schemaMysql.ts';
import {attachHandlers, schemaCrudBindImpl, schemaTableSyncImpl} from './knex/schemaTable.ts';
import {type IConfig, type ISchemaTable} from './knex/types.ts';
import {methodId, readSqlFiles, snakeToCamel} from './knex/utils.ts';

export type {IConfig, ISchemaTable} from './knex/types.ts';

const errorMap: IErrorMap = {
    'knex.generic': 'Knex Error',
    'knex.invalid': 'Invalid Knex Operation',
    'knex.notFound': 'Knex Not Found',
    'knex.exists': 'Knex Exists',
    'knex.unique': 'Knex Unique',
    'knex.missingKey': 'Missing key value for {key}',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
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
                        typeof a === 'object' && 'definition' in a
                            ? ((a as ISchemaTable).order ?? 0)
                            : 0;
                    const orderB =
                        typeof b === 'object' && 'definition' in b
                            ? ((b as ISchemaTable).order ?? 0)
                            : 0;
                    return orderA - orderB;
                });
                for (const [tableName, tableConfig] of tables) {
                    const isSpec = typeof tableConfig === 'object' && 'definition' in tableConfig;
                    const definition = isSpec
                        ? (tableConfig as ISchemaTable).definition
                        : (tableConfig as TObject);
                    const dropColumns = isSpec
                        ? ((tableConfig as ISchemaTable).dropColumns ?? false)
                        : false;
                    await schemaTableSyncImpl(knex, tableName, definition, {dropColumns});
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
                const namespace = this.config.namespace;
                if (namespace) {
                    const tableDefs = Object.entries(schema.tables ?? {}).map(
                        ([tableName, tableConfig]) => {
                            const isSpec =
                                typeof tableConfig === 'object' && 'definition' in tableConfig;
                            const definition = isSpec
                                ? (tableConfig as ISchemaTable).definition
                                : (tableConfig as TObject);
                            return {tableName, definition};
                        },
                    );
                    await bindSyntheticCrud(self, knex, namespace, tableDefs);
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
                key: string;
                select: string;
                order: string;
                limit: number;
                offset: number;
            } & Record<string, unknown>,
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, table, operation] = method!.split('.');
            switch (operation) {
                case 'get': {
                    const {select = '*', ...where} = params;
                    return this.config.context.queryBuilder!(table).where(where).first(select);
                }
                case 'find': {
                    const {select = '*', order, limit, offset, ...where} = params;
                    let result = this.config.context.queryBuilder!(table).where(where);
                    if (order) result = result.orderBy(order);
                    if (limit) result = result.limit(limit);
                    if (offset) result = result.offset(offset);
                    return result.select(select);
                }
                case 'add':
                    return {
                        [`${table}Id`]: (
                            await this.config.context.queryBuilder!(table).insert(params)
                        )?.[0],
                    };
                case 'edit': {
                    const {key: keyName = `${table}Id`, ...columns} = params;
                    const {[keyName]: key, ...update} = columns;
                    return this.config.context.queryBuilder!(table)
                        .where({[keyName]: key})
                        .update(update);
                }
                case 'remove':
                    if (!(table + 'Id' in params)) {
                        throw this.error(_errors['knex.missingKey']({key: table + 'Id'}), $meta);
                    }
                    return this.config.context.queryBuilder!(table)
                        .where({[table + 'Id']: params[table + 'Id']})
                        .del();
                case 'merge': {
                    const {key = `${table}Id`, ...columns} = params;
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
