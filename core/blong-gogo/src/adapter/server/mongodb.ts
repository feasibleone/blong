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
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, _table, operation] = method!.split('.');
            let table = _table;
            let dbName: string | undefined;
            // `{ns}.collection.*` triples carry `{database, collection}`; the
            // collection is the table, the database selects the DB (and must NOT
            // leak into the WHERE filter — previously docs were filtered by a
            // literal `database` field, yielding empty lists).
            if (!Array.isArray(params) && _table === 'collection') {
                const {collection, database, ...rest} = params;
                if (collection) {
                    table = collection;
                    params = rest;
                }
                dbName = database as string | undefined;
            }
            const key = table.split(/\W/, 1)[0] + 'Id';
            switch (operation) {
                case 'get': {
                    // get single document
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
                    const nonArrayParams = params as Record<string, unknown>;
                    const {select = '*', sort, [key]: _id, ...where} = nonArrayParams;
                    const doc = await this.config.context
                        .mongodb!.db(dbName)
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
                    // Surface a string `id` (mongo's `_id` is an ObjectId object,
                    // dropped by the commander's scalar-only flattening).
                    return doc
                        ? {...doc, id: String((doc as {_id?: unknown})._id ?? '')}
                        : doc;
                }
                case 'find': {
                    // find multiple documents
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
                    const {select = '*', order, limit, offset, [key]: _id, ...where} = params;
                    const docs = await this.config.context
                        .mongodb!.db(dbName)
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
                    // Surface a string `id` for the commander explorer rows.
                    return docs.map(doc => ({...doc, id: String((doc as {_id?: unknown})._id ?? '')}));
                }
                case 'add': {
                    // add single document
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
                    const {[key]: _id, ...rest} = params;
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .insertOne(_id !== undefined ? {_id, ...rest} : rest);
                }
                case 'edit': {
                    // edit single document with full replace
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
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
                    if (!(key in params)) {
                        throw this.error(_errors['mongodb.missingKey']({key}), $meta);
                    }
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
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
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
                    if (!Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
                    return this.config.context
                        .mongodb!.db()
                        .collection(table)
                        .insertMany(params as OptionalId<BSON.Document>[]);
                }
                case 'update': {
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
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
                case 'list': {
                    // Enumeration for the commander explorer:
                    //   `{ns}.database.list`   → databases on the server
                    //   `{ns}.collection.list` → collections in a database (params.database)
                    if (Array.isArray(params)) {
                        throw this.error(_errors['mongodb.invalid'](), $meta);
                    }
                    if (_table === 'database') {
                        const result = await this.config.context
                            .mongodb!.db()
                            .admin()
                            .listDatabases();
                        return {
                            items:
                                result.databases?.map(db => ({
                                    database: db.name,
                                    sizeOnDisk: db.sizeOnDisk,
                                    empty: db.empty,
                                })) ?? [],
                        };
                    }
                    if (_table === 'collection') {
                        const database = (params as Record<string, unknown>).database as
                            | string
                            | undefined;
                        const collections = await this.config.context
                            .mongodb!.db(database)
                            .listCollections()
                            .toArray();
                        return {
                            items: collections.map(c => ({
                                collection: c.name,
                                type: c.type,
                                // thread the DB so deeper levels can resolve
                                // `{parent.database}`
                                database,
                            })),
                        };
                    }
                    throw this.error(_errors['mongodb.invalid'](), $meta);
                }
            }
            throw this.error(_errors['mongodb.generic'](), $meta);
        },
    };
});
