import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong/types';
import mongoUriBuilder from 'mongo-uri-builder';
import {
    type BSON,
    type Filter,
    MongoClient,
    type OptionalId,
    type Sort,
    type UpdateFilter,
} from 'mongodb';

export interface IConfig {
    mongodb: object;
}

const errorMap: IErrorMap = {
    'mongodb.generic': 'Mongodb Error',
    'mongodb.invalid': 'Invalid Mongodb Operation',
    'mongodb.notFound': 'Mongodb Not Found',
    'mongodb.exists': 'Mongodb Exists',
    'mongodb.unique': 'Mongodb Unique',
    'mongodb.missingKey': 'Missing key value for {key}',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        activation: {
            default: {
                type: 'mongodb',
            },
        },
        async start() {
            this.config.context = {
                mongodb: new MongoClient(mongoUriBuilder(this.config.mongodb)),
            };
            await this.config.context.mongodb!.connect();

            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                await this.config.context.mongodb!.close();
            } finally {
                this.config.context = {};
                result = await super.stop(...params);
            }
            return result;
        },
        async exec(
            params:
                | ({
                      select?: string;
                      order?: string;
                      limit?: number;
                      offset?: number;
                      sort?: Sort;
                      collection?: string;
                      where?: object;
                      operators?: object;
                  } & Record<string, unknown>)
                | unknown[],
            {method}: IMeta,
        ) {
            const [, _table, operation] = method!.split('.');
            let table = _table;
            if (!Array.isArray(params) && _table === 'collection') {
                const {collection, ...rest} = params;
                if (collection) {
                    table = collection;
                    params = rest;
                }
            }
            const key = table.split(/\W/, 1)[0] + 'Id';
            switch (operation) {
                case 'get': {
                    // get single document
                    if (Array.isArray(params)) throw _errors['mongodb.invalid']();
                    const nonArrayParams = params as Record<string, unknown>;
                    const {select = '*', sort, [key]: _id, ...where} = nonArrayParams;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .findOne(
                            {
                                ...(_id != null ? {_id: _id as BSON.ObjectId} : {}),
                                ...(where as Record<string, unknown>),
                            },
                            {
                                projection:
                                    select === '*'
                                        ? undefined
                                        : (select as string).split(',').reduce(
                                              (acc, field) => ({
                                                  ...acc,
                                                  [field.trim()]: 1,
                                              }),
                                              {},
                                          ),
                                sort: sort as import('mongodb').Sort | undefined,
                            },
                        );
                }
                case 'find': {
                    // find multiple documents
                    if (Array.isArray(params)) throw _errors['mongodb.invalid']();
                    const {select = '*', order, limit, offset, [key]: _id, ...where} = params;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .find(
                            {
                                ...(_id != null ? {_id: _id as BSON.ObjectId} : {}),
                                ...where,
                            },
                            {
                                projection:
                                    select === '*'
                                        ? undefined
                                        : (select as string).split(',').reduce(
                                              (acc, field) => ({
                                                  ...acc,
                                                  [field.trim()]: 1,
                                              }),
                                              {},
                                          ),
                                limit: typeof limit === 'number' ? limit : undefined,
                                skip: typeof offset === 'number' ? offset : undefined,
                                sort: order
                                    ? (order as string).split(',').reduce(
                                          (acc, field) => ({
                                              ...acc,
                                              [field.trim().replace(/^-/, '')]: field.startsWith(
                                                  '-',
                                              )
                                                  ? -1
                                                  : 1,
                                          }),
                                          {},
                                      )
                                    : undefined,
                            },
                        )
                        .toArray();
                }
                case 'add': {
                    // add single document
                    if (Array.isArray(params)) throw _errors['mongodb.invalid']();
                    const {[key]: _id, ...rest} = params;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .insertOne(_id !== undefined ? {_id, ...rest} : rest);
                }
                case 'edit': {
                    // edit single document with full replace
                    if (Array.isArray(params)) throw _errors['mongodb.invalid']();
                    const {[key]: _id, where, operators, ...rest} = params;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .updateOne(
                            {...(_id != null ? {_id: _id as BSON.ObjectId} : {}), ...where},
                            {$set: rest, ...(operators as object)},
                        );
                }
                case 'remove': // remove single document
                    if (!(key in params)) throw _errors['mongodb.missingKey']({key});
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .deleteOne({
                            _id: (params as Record<string, unknown>)[key] as
                                | BSON.ObjectId
                                | undefined,
                        });

                case 'merge': {
                    // edit single document with partial update
                    if (Array.isArray(params)) throw _errors['mongodb.invalid']();
                    const {[key]: _id, ...rest} = params;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .updateMany(
                            {...(_id != null ? {_id: _id as BSON.ObjectId} : {})},
                            {$set: rest},
                            {upsert: true},
                        );
                }
                case 'insert': {
                    // insert multiple documents
                    if (!Array.isArray(params)) throw _errors['mongodb.invalid']();
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .insertMany(params as OptionalId<BSON.Document>[]);
                }
                case 'update': {
                    if (Array.isArray(params)) throw _errors['mongodb.invalid']();
                    const {[key]: _id, update, ...where} = params;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .updateMany(
                            {...(_id != null ? {_id: _id as BSON.ObjectId} : {}), ...where},
                            update as UpdateFilter<BSON.Document>,
                        );
                }
                case 'delete': // delete multiple documents
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .deleteMany(params as Filter<BSON.Document>);
            }
            throw _errors['mongodb.generic']();
        },
    };
});
