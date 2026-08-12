import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {hashFields, hashKey} from '../fixtures/keys.ts';

type StepMeta = {$meta: Record<string, unknown>};

/**
 * testRedisHash — integration test covering the generic hash vocabulary
 * of `adapter.redis`: `redis.hash.set|get|getAll|incrBy|del`.
 */
export default handler(
    ({
        lib: {group},
        handler: {redisHashSet, redisHashGet, redisHashGetAll, redisHashIncrBy, redisHashDel},
    }) => ({
        testRedisHash: ({name = 'redis hash vocabulary'}: {name?: string}) =>
            group(name)([
                async function setFields(assert: typeof Assert, {$meta}: StepMeta) {
                    for (const [fieldName, fieldValue] of Object.entries(hashFields)) {
                        const result = await redisHashSet(
                            {keyName: hashKey, fieldName, fieldValue},
                            $meta,
                        );
                        assert.ok(result, `set ${fieldName} should return a result`);
                        assert.strictEqual(
                            (result as {success?: boolean}).success,
                            true,
                            `set ${fieldName} should succeed`,
                        );
                    }
                    return {set: true};
                },
                async function getField(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisHashGet<{value?: string}>(
                        {keyName: hashKey, fieldName: 'firstName'},
                        $meta,
                    );
                    assert.strictEqual(result.value, hashFields.firstName, 'get should return the field value');
                    return result;
                },
                async function getAllFields(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisHashGetAll<{fields?: Record<string, string>}>(
                        {keyName: hashKey},
                        $meta,
                    );
                    assert.ok(result.fields, 'getAll should return a fields map');
                    assert.strictEqual(
                        result.fields?.firstName,
                        hashFields.firstName,
                        'getAll should include firstName',
                    );
                    assert.strictEqual(
                        result.fields?.role,
                        hashFields.role,
                        'getAll should include role',
                    );
                    return result;
                },
                async function incrByField(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisHashIncrBy<{value?: number}>(
                        {keyName: hashKey, fieldName: 'visits', increment: 5},
                        $meta,
                    );
                    assert.strictEqual(result.value, 5, 'incrBy should return the incremented value');
                    const second = await redisHashIncrBy<{value?: number}>(
                        {keyName: hashKey, fieldName: 'visits', increment: 3},
                        $meta,
                    );
                    assert.strictEqual(second.value, 8, 'second incrBy should accumulate');
                    return result;
                },
                async function delField(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisHashDel<{deleted?: number}>(
                        {keyName: hashKey, fieldName: 'visits'},
                        $meta,
                    );
                    assert.strictEqual(result.deleted, 1, 'del should remove one field');
                    const gone = await redisHashGet<{value?: string | null}>(
                        {keyName: hashKey, fieldName: 'visits'},
                        $meta,
                    );
                    assert.strictEqual(gone.value, null, 'get after del should return null');
                    return result;
                },
            ]),
    }),
);
