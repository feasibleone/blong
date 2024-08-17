import Knex from 'knex';

import {adapter, type Errors, IMeta} from '../../../types.js';
import type {IErrorMap} from '../../error.js';

export interface IConfig {
    knex: object;
    context: {
        queryBuilder: Knex.Knex;
    };
}

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
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'knex',
                },
                ...configs
            );
        },
        start() {
            this.config.context = {queryBuilder: Knex(this.config.knex)};
            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                await this.config.context.queryBuilder?.destroy();
            } finally {
                this.config.context = null;
                result = await super.stop(...params);
            }
            return result;
        },
        async exec(
            params: {
                key: string;
                select: string;
                order: string;
                limit: number;
                offset: number;
            } & Record<string, unknown>,
            {method}: IMeta
        ) {
            const [, table, operation] = method.split('.');
            switch (operation) {
                case 'get': {
                    const {select = '*', ...where} = params;
                    return this.config.context.queryBuilder(table).where(where).first(select);
                }
                case 'find': {
                    const {select = '*', order, limit, offset, ...where} = params;
                    let result = this.config.context.queryBuilder(table).where(where);
                    if (order) result = result.orderBy(order);
                    if (limit) result = result.limit(limit);
                    if (offset) result = result.offset(offset);
                    return result.select(select);
                }
                case 'add':
                    return {
                        [`${table}Id`]: (
                            await this.config.context.queryBuilder(table).insert(params)
                        )?.[0],
                    };
                case 'edit': {
                    const {key: keyName = `${table}Id`, ...columns} = params;
                    const {[keyName]: key, ...update} = columns;
                    return this.config.context
                        .queryBuilder(table)
                        .where({[keyName]: key})
                        .update(update);
                }
                case 'remove':
                    if (!(table + 'Id' in params))
                        throw _errors['knex.missingKey']({key: table + 'Id'});
                    return this.config.context
                        .queryBuilder(table)
                        .where({[table + 'Id']: params[table + 'Id']})
                        .del();
                case 'merge':
                    const {key = `${table}Id`, ...columns} = params;
                    return this.config.context
                        .queryBuilder(table)
                        .insert(columns)
                        .onConflict(key)
                        .merge();
                case 'insert':
                    return this.config.context.queryBuilder(table).insert(params);
                case 'update': {
                    const {select = '*', ...where} = params;
                    return this.config.context.queryBuilder(table).where(where).update(select);
                }
                case 'delete':
                    return this.config.context.queryBuilder(table).where(params).del();
            }
            throw _errors['knex.generic']();
        },
    };
});
