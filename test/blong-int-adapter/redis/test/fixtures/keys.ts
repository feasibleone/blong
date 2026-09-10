/**
 * Fixture data for Redis integration tests.
 * Tests the generic adapter vocabulary: `redis.key.*`, `redis.hash.*`,
 * `redis.script.*`.  Each run uses unique keys so parallel runs never clash.
 */

/** Unique key prefix so tests are isolated across runs. */
export const KEY_PREFIX = `blong-test:${Date.now()}`;

export const stringKey = `${KEY_PREFIX}:greeting`;
export const stringValue = 'hello-from-blong-test';

export const hashKey = `${KEY_PREFIX}:profile`;
export const hashFields: Record<string, string> = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'analyst',
};

/** A trivial Lua script: SET then GET a key (returns the value). */
export const echoScript = `
local key = KEYS[1]
local val = ARGV[1]
redis.call('SET', key, val)
return redis.call('GET', key)
`.trim();
