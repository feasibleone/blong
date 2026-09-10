import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';

import {cfgKey, creditsKey, monthKey, rateKey} from '../meter/keys.ts';
import {meterScript, parseMeterResult} from '../meter/script.ts';

/**
 * Metering adapter instance (extends the generic `adapter.redis` base from
 * blong-gogo).
 *
 * Registers the `meter` namespace so the gateway handlers can reach the
 * metering operations (`meter.limit.meter|hydrate|cfg|adjust|reset`) via the
 * handler proxy.  The generic redis vocabulary (`redis.key.*`, `redis.hash.*`,
 * `redis.script.*`) is inherited from the base adapter and stays reachable
 * through the same port.  Connection is lazy + fail-closed (any Redis error
 * surfaces as `redis.unavailable` → HTTP 503).
 */
const errorMap: IErrorMap = {
    'redis.unavailable': {message: 'Redis unavailable', statusCode: 503},
};

let _errors: Errors<typeof errorMap>;

/** The subset of the base adapter's client used by the metering ops. */
interface IRedisClient {
    status: string;
    connect(): Promise<unknown>;
    eval(script: string, numKeys: number, ...keysAndArgs: unknown[]): Promise<unknown>;
    hgetall(key: string): Promise<Record<string, string>>;
    hset(key: string, field: string, value: string | number): Promise<unknown>;
    hincrby(key: string, field: string, increment: number): Promise<number>;
    del(...keys: string[]): Promise<number>;
}

export default adapter<{
    redis: {
        host?: string;
        port?: number;
        cluster?: boolean;
        nodes?: Array<{host: string; port: number}>;
        password?: string;
        db?: number;
    };
}>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        extends: 'adapter.redis',
        activation: {
            default: {
                namespace: 'meter',
                imports: [],
            },
            dev: {
                redis: {
                    host: '127.0.0.1',
                    port: 6379,
                },
            },
            integration: {
                redis: {
                    host: '127.0.0.1',
                    port: 6379,
                },
            },
        },
        async exec(params: Record<string, unknown>, $meta: IMeta) {
            // Dispatch on the last method segment so both the bare
            // `meter.limit.meter` and the namespace-prefixed
            // `meter.gateway.limit.meter` forms reach the same operation.
            const parts = ($meta.method ?? '').split('.');
            const operation = parts[parts.length - 1];
            const redis = (this.config.context as {redis?: IRedisClient}).redis;
            try {
                if (!redis) throw new Error('Redis client not available');
                const status = redis.status;
                if (
                    status !== 'ready' &&
                    status !== 'connect' &&
                    status !== 'connecting' &&
                    status !== 'reconnecting'
                ) {
                    await redis.connect();
                }
                switch (operation) {
                    case 'meter': {
                        const {applicationId, bundleName, creditCost, rateWindowSec} = params as {
                            applicationId: string;
                            bundleName: string;
                            creditCost: number;
                            rateWindowSec: number;
                            now?: number;
                        };
                        const now = (params.now as number | undefined) ??
                            Math.floor(Date.now() / 1000);
                        const keys = [
                            cfgKey(applicationId, bundleName),
                            creditsKey(applicationId, monthKey(now)),
                            rateKey(applicationId, bundleName, rateWindowSec, now),
                        ];
                        const raw = await redis.eval(
                            meterScript,
                            keys.length,
                            ...keys,
                            creditCost,
                            now,
                            rateWindowSec,
                        );
                        return parseMeterResult(raw);
                    }
                    case 'hydrate': {
                        const {
                            applicationId,
                            bundleName,
                            baseMonthlyCredits,
                            rateLimit,
                            rateWindowSec,
                        } = params as {
                            applicationId: string;
                            bundleName: string;
                            baseMonthlyCredits: number;
                            rateLimit: number;
                            rateWindowSec: number;
                        };
                        const key = cfgKey(applicationId, bundleName);
                        await redis.hset(key, 'baseMonthlyCredits', baseMonthlyCredits);
                        await redis.hset(key, 'rateLimit', rateLimit);
                        await redis.hset(key, 'rateWindowSec', rateWindowSec);
                        return {success: true};
                    }
                    case 'cfg': {
                        const {applicationId, bundleName} = params as {
                            applicationId: string;
                            bundleName: string;
                        };
                        return redis.hgetall(cfgKey(applicationId, bundleName));
                    }
                    case 'adjust': {
                        const {applicationId, delta} = params as {
                            applicationId: string;
                            delta: number;
                            month?: string;
                            now?: number;
                        };
                        const now = (params.now as number | undefined) ??
                            Math.floor(Date.now() / 1000);
                        const month = (params.month as string | undefined) ?? monthKey(now);
                        const balance = await redis.hincrby(
                            creditsKey(applicationId, month),
                            'balance',
                            delta,
                        );
                        return {balance};
                    }
                    case 'reset': {
                        const {applicationId, bundleName, clearCredits} = params as {
                            applicationId: string;
                            bundleName?: string;
                            clearCredits?: boolean;
                            month?: string;
                            now?: number;
                        };
                        const now = (params.now as number | undefined) ??
                            Math.floor(Date.now() / 1000);
                        const month = (params.month as string | undefined) ?? monthKey(now);
                        const keys = [
                            ...(bundleName
                                ? [cfgKey(applicationId, bundleName), rateKey(applicationId, bundleName, 60, now)]
                                : []),
                        ];
                        if (clearCredits) keys.push(creditsKey(applicationId, month));
                        if (keys.length > 0) await redis.del(...keys);
                        return {success: true};
                    }
                    default:
                        return super.exec(params, $meta);
                }
            } catch (error) {
                throw this.error(_errors['redis.unavailable'](error), $meta);
            }
        },
    };
});
