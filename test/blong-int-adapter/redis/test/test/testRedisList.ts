import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {stringKey} from '../fixtures/keys.ts';

/**
 * testRedisList — integration test for the commander explore vocabulary of
 * `adapter.redis`:
 *   `redis.key.list`      → SCAN keys (pattern/count/limit/cursor)
 *   `redis.database.list` → the logical database(s) this source exposes
 */
export default handler(
    ({lib: {group}, handler: {redisKeySet, redisKeyList, redisDatabaseList}}) => ({
        testRedisList: ({name = 'redis explore list'}: {name?: string}) =>
            group(name)([
                async function listKeys(assert: typeof Assert, {$meta}) {
                    await redisKeySet(
                        {keyName: stringKey, keyValue: 'commander-list-test'},
                        $meta,
                    );
                    const result = await redisKeyList({pattern: '*', limit: 100}, $meta);
                    const items = (result as {items?: Array<{keyName?: string}>}).items ?? [];
                    assert.ok(Array.isArray(items), 'key.list should return items');
                    assert.ok(
                        items.some(item => item.keyName === stringKey),
                        'key.list should include the stored key',
                    );
                    return result;
                },
                async function listDatabases(assert: typeof Assert, {$meta}) {
                    const result = await redisDatabaseList({}, $meta);
                    const items = (result as {items?: unknown[]}).items ?? [];
                    assert.ok(Array.isArray(items), 'database.list should return items');
                    assert.ok(items.length > 0, 'should list at least one database');
                    return result;
                },
            ]),
    }),
);
