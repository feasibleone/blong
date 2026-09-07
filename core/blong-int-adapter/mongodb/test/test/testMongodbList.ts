import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

/**
 * testMongodbList — integration test for the commander explore vocabulary of
 * `adapter.mongodb`:
 *   `mongo.database.list`   → databases on the server
 *   `mongo.collection.list` → collections in a database
 */
export default handler(
    ({lib: {group}, handler: {mongoDatabaseList, mongoCollectionList}}) => ({
        testMongodbList: ({name = 'mongodb explore list'}: {name?: string}) =>
            group(name)([
                async function listDatabases(assert: typeof Assert, {$meta}) {
                    const result = await mongoDatabaseList({}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'database.list should return items');
                    assert.ok(items.length > 0, 'should list at least one database');
                    return result;
                },
                async function listCollections(assert: typeof Assert, {$meta}) {
                    const dbs = (await mongoDatabaseList({}, $meta)) as {
                        items?: Array<{database?: string}>;
                    };
                    const dbName = dbs.items?.[0]?.database;
                    assert.ok(dbName, 'a database is available for collection listing');
                    const result = await mongoCollectionList({database: dbName}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'collection.list should return items');
                    return result;
                },
            ]),
    }),
);
