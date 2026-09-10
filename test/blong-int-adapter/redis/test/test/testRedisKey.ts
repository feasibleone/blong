import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {stringKey, stringValue} from '../fixtures/keys.ts';

type StepMeta = {$meta: Record<string, unknown>};

/**
 * testRedisKey — integration test covering the generic string-key vocabulary
 * of `adapter.redis`: `redis.key.set|get|exists|expire|ttl|del`.
 */
export default handler(
    ({lib: {group}, handler: {redisKeySet, redisKeyGet, redisKeyExists, redisKeyExpire, redisKeyTtl, redisKeyDel}}) => ({
        testRedisKey: ({name = 'redis key vocabulary'}: {name?: string}) =>
            group(name)([
                async function setKey(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeySet({keyName: stringKey, keyValue: stringValue}, $meta);
                    assert.ok(result, 'set should return a result');
                    assert.strictEqual(
                        (result as {success?: boolean}).success,
                        true,
                        'set should succeed',
                    );
                    return result;
                },
                async function getKey(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeyGet<{value?: string}>({keyName: stringKey}, $meta);
                    assert.ok(result, 'get should return a result');
                    assert.strictEqual(result.value, stringValue, 'get should return the stored value');
                    return result;
                },
                async function existsKey(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeyExists<{exists?: boolean}>({keyName: stringKey}, $meta);
                    assert.strictEqual(result.exists, true, 'exists should be true for a stored key');
                    return result;
                },
                async function expireKey(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeyExpire<{expired?: boolean}>(
                        {keyName: stringKey, seconds: 60},
                        $meta,
                    );
                    assert.strictEqual(result.expired, true, 'expire should succeed on a live key');
                    return result;
                },
                async function ttlKey(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeyTtl<{ttl?: number}>({keyName: stringKey}, $meta);
                    assert.ok((result.ttl ?? 0) > 0, 'ttl should be positive after expire');
                    return result;
                },
                async function delKey(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeyDel<{deleted?: number}>({keyName: stringKey}, $meta);
                    assert.strictEqual(result.deleted, 1, 'del should remove exactly one key');
                    return result;
                },
                async function getMissing(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await redisKeyGet<{value?: string | null}>({keyName: stringKey}, $meta);
                    assert.strictEqual(result.value, null, 'get after del should return null');
                    return result;
                },
            ]),
    }),
);
