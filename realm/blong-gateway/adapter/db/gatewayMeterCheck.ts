import {type IMeta, handler} from '@feasibleone/blong';

type KnexQb = any;

interface MeterDecision {
    allowed: boolean;
    reason: 'ok' | 'rate' | 'credits' | 'subscription';
    creditsRemaining?: number;
    rateLimit?: number;
    rateCount?: number;
    rateResetAt: number;
}

interface RedisMeterResult {
    allowed: boolean;
    reason: 'ok' | 'rate' | 'credits';
    creditsRemaining: number;
    rateLimit: number;
    rateCount: number;
    ttl: number;
}

/**
 * Per-request metering orchestration, called by the `ApiGateway` plugin.
 *
 * Wire: `gateway.meter.check` — receives `{bundle, creditCost}` from the route
 * config and the authenticated application's id via `$meta.auth.actorId`.
 *
 * 1. Reads the cached bundle config (`{app}:cfg`) from Redis.
 * 2. On a cache miss, resolves the application's active subscription to the
 *    bundle from the DB and hydrates the Redis cfg.
 * 3. Runs the atomic Lua script (rate limit + credit deduction) in one hop.
 *
 * Fail-closed: missing/expired subscription or a Redis error ⇒ deny (the
 * plugin converts errors to 503).
 */
export default handler(
    ({lib: {crockfordDecode}, handler: {meterLimitCfg, meterLimitHydrate, meterLimitMeter}}) =>
        async function gatewayMeterCheck(
            params: {bundle: string; creditCost: number},
            $meta: IMeta,
        ): Promise<MeterDecision> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const actorId = ($meta?.auth as {actorId?: string} | undefined)?.actorId;
            if (!actorId) {
                return {allowed: false, reason: 'subscription', rateResetAt: 0};
            }
            // The crockford actorId is a stable, opaque Redis key suffix.
            const applicationId = actorId;
            const bundleName = params.bundle;

            // 1. Cached bundle config (per bundle)
            let cfg = await meterLimitCfg<Record<string, string>>(
                {applicationId, bundleName},
                $meta,
            );

            // 2. Hydrate on cache miss from the active subscription
            if (!cfg || cfg.baseMonthlyCredits === undefined) {
                const bundle = await qb('gateway_subscription as s')
                    .select('b.baseMonthlyCredits', 'b.rateLimit', 'b.rateWindowSec', 'b.isActive')
                    .join('gateway_bundle as b', 'b.bundleId', 's.bundleId')
                    .join('core_resource as cr', 'cr.resourceId', 'b.bundleId')
                    .where('cr.resourceName', params.bundle)
                    .where('s.applicationId', Buffer.from(crockfordDecode(actorId) as Uint8Array))
                    .where('s.status', 'active')
                    .where('s.startsAt', '<=', new Date())
                    .where(function (this: any) {
                        this.whereNull('s.endsAt').orWhere('s.endsAt', '>', new Date());
                    })
                    .first();

                if (!bundle || !bundle.isActive) {
                    return {allowed: false, reason: 'subscription', rateResetAt: 0};
                }
                await meterLimitHydrate(
                    {
                        applicationId,
                        bundleName,
                        baseMonthlyCredits: Number(bundle.baseMonthlyCredits),
                        rateLimit: Number(bundle.rateLimit),
                        rateWindowSec: Number(bundle.rateWindowSec),
                    },
                    $meta,
                );
                cfg = {
                    baseMonthlyCredits: String(bundle.baseMonthlyCredits),
                    rateLimit: String(bundle.rateLimit),
                    rateWindowSec: String(bundle.rateWindowSec),
                };
            }

            // 3. Atomic metering (rate limit + credit deduction) in one Redis hop
            const rateWindowSec = Number(cfg.rateWindowSec || 60);
            const result = await meterLimitMeter<RedisMeterResult>(
                {
                    applicationId,
                    bundleName,
                    creditCost: params.creditCost,
                    rateWindowSec,
                },
                $meta,
            );

            const now = Math.floor(Date.now() / 1000);
            return {
                allowed: result.allowed,
                reason: result.reason,
                creditsRemaining: result.creditsRemaining,
                rateLimit: result.rateLimit,
                rateCount: result.rateCount,
                rateResetAt: now + (result.ttl > 0 ? result.ttl : rateWindowSec),
            };
        },
);
