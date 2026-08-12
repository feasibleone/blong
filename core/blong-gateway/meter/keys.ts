// Redis key layout for the ApiGateway metering layer.
//
// Every key for one application carries the same `{app:<id>}` hash tag so that,
// in a Redis Cluster topology, all keys for that application resolve to the
// same slot.  This keeps the metering Lua script atomic on a single shard —
// the script only touches keys that share the tag.

/** Config hash for a bundle: {baseMonthlyCredits, rateLimit, rateWindowSec}. */
export function cfgKey(applicationId: string, bundle: string): string {
    return `{app:${applicationId}}:cfg:${bundle}`;
}

/**
 * Monthly credit bucket key for the given `YYYY-MM` month.
 * HASH: {balance, base, updatedAt}.  The Lua script auto-initialises it with
 * the subscription base allowance on the first request of a new month, giving a
 * deterministic monthly reset.  External management scripts may scale credits
 * mid-month by running `HINCRBY <key> balance <delta>` directly.
 */
export function creditsKey(applicationId: string, month: string): string {
    return `{app:${applicationId}}:credits:${month}`;
}

/** Fixed-window rate counter key (per bundle) with TTL. */
export function rateKey(
    applicationId: string,
    bundle: string,
    windowSec: number,
    now: number,
): string {
    const window = Math.floor(now / windowSec);
    return `{app:${applicationId}}:rate:${bundle}:${window}`;
}

/**
 * The `YYYY-MM` bucket for the given epoch timestamp (UTC, so the reset is
 * deterministic across instances).
 */
export function monthKey(now: number): string {
    const date = new Date(now * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
