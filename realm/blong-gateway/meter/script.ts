// Atomic metering script (rate-limit + credit deduction) executed via EVAL on
// the Redis adapter.
//
// All keys carry the same `{app:<id>}` hash tag, so the script always runs on a
// single cluster slot and is atomic with respect to concurrent requests from
// the same application.
//
// KEYS[1] = {app:<id>}:cfg            HASH {baseMonthlyCredits, rateLimit, rateWindowSec}
// KEYS[2] = {app:<id>}:credits:YYYY-MM HASH {balance, base, updatedAt}
// KEYS[3] = {app:<id>}:rate:<window>   STRING counter (fixed window, TTL)
//
// ARGV[1] = creditCost  ARGV[2] = now (epoch seconds)  ARGV[3] = rateWindowSec
//
// Returns an array: {allowed, reason, creditsRemaining, rateCount, rateLimit, ttl}

export const meterScript = `
local cfgKey  = KEYS[1]
local credKey = KEYS[2]
local rateKey = KEYS[3]

local cost   = tonumber(ARGV[1])
local now    = tonumber(ARGV[2])
local window = tonumber(ARGV[3])

-- 1) rate limit (fixed window, auto-create with TTL)
local limit = tonumber(redis.call('HGET', cfgKey, 'rateLimit') or '0')
local count = redis.call('INCR', rateKey)
if count == 1 then redis.call('EXPIRE', rateKey, window) end
if limit > 0 and count > limit then
    return {0, 'rate', -1, count, limit, redis.call('TTL', rateKey)}
end

-- 2) credits (monthly bucket, deterministic auto-init from cfg.base on the
--    first request of a new month)
local base = tonumber(redis.call('HGET', cfgKey, 'baseMonthlyCredits') or '0')
local bal = redis.call('HGET', credKey, 'balance')
if not bal then
    redis.call('HSET', credKey, 'balance', base)
    redis.call('HSET', credKey, 'base', base)
    redis.call('HSET', credKey, 'updatedAt', now)
    bal = base
end
bal = tonumber(bal)
if bal < cost then
    return {0, 'credits', bal, count, limit, redis.call('TTL', rateKey)}
end
redis.call('HINCRBY', credKey, 'balance', -cost)
return {1, 'ok', bal - cost, count, limit, redis.call('TTL', rateKey)}
`.trim();

export type MeterReason = 'ok' | 'rate' | 'credits';

export interface MeterResult {
    allowed: boolean;
    reason: MeterReason;
    creditsRemaining: number;
    rateCount: number;
    rateLimit: number;
    ttl: number;
}

/**
 * Parse the Lua response array into a structured MeterResult.
 * A non-array / unexpected response is treated as a deny (fail-closed).
 */
export function parseMeterResult(raw: unknown): MeterResult {
    const values = Array.isArray(raw) ? raw : [];
    const [allowed, reason, creditsRemaining, rateCount, rateLimit, ttl] =
        values as unknown[];
    return {
        allowed: allowed === 1,
        reason: (reason as MeterReason) || 'ok',
        creditsRemaining: Number(creditsRemaining ?? -1),
        rateCount: Number(rateCount ?? -1),
        rateLimit: Number(rateLimit ?? -1),
        ttl: Number(ttl ?? -1),
    };
}
