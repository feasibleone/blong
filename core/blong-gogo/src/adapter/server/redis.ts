import type {IMeta, Adapter} from '@feasibleone/blong/types';
import {adapter, type Errors, type IErrorMap} from '@feasibleone/blong/types';
import Redis from 'ioredis';
import {Cluster} from 'ioredis';

export interface IConfig {
    /**
     * Cluster topology: when true, connect to `nodes` via ioredis Cluster.
     * Generic key/hash/script operations work the same in both topologies.
     */
    cluster?: boolean;
    /** Cluster seed nodes (used when `cluster: true`). */
    nodes?: Array<{host: string; port: number}>;
    /** Single-node host (used when `cluster: false`). */
    host?: string;
    /** Single-node port (used when `cluster: false`). */
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
}

const errorMap: IErrorMap = {
    'redis.unavailable': {message: 'Redis unavailable', statusCode: 503},
};

let _errors: Errors<typeof errorMap>;

/**
 * The subset of the ioredis API the generic adapter (+ derived realm adapters)
 * uses.  Derived adapters reach the live client via
 * `this.config.context.redis`.
 */
export interface IRedisClient {
    status: string;
    connect(): Promise<unknown>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    exists(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string | number): Promise<unknown>;
    hincrby(key: string, field: string, increment: number): Promise<number>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    eval(script: string, numKeys: number, ...keysAndArgs: unknown[]): Promise<unknown>;
    quit(): Promise<unknown>;
}

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    let redis: IRedisClient;

    /**
     * (Re)create the ioredis client from a `redis` config slice.
     * Connection is lazy — the first command connects; any failure surfaces
     * synchronously and is wrapped into `redis.unavailable` (503).
     */
    const createClient = (config: IConfig): void => {
        const shared = {
            keyPrefix: config.keyPrefix,
            password: config.password,
            maxRetriesPerRequest: config.maxRetriesPerRequest ?? 1,
            enableOfflineQueue: config.enableOfflineQueue ?? false,
            lazyConnect: config.lazyConnect ?? true,
        };
        redis = config.cluster
            ? (new Cluster(
                  (config.nodes ?? []).map(node => ({host: node.host, port: node.port})),
                  {
                      redisOptions: shared,
                  },
              ) as unknown as IRedisClient)
            : (new Redis({
                  host: config.host ?? '127.0.0.1',
                  port: config.port ?? 6379,
                  db: config.db,
                  ...shared,
              }) as unknown as IRedisClient);
    };

    /**
     * Ensure the lazy client is connected before the first command.
     * If Redis is down this rejects and the request is blocked (503).
     */
    const ensureConnected = async (): Promise<IRedisClient> => {
        const status = redis.status;
        if (
            status !== 'ready' &&
            status !== 'connect' &&
            status !== 'connecting' &&
            status !== 'reconnecting'
        ) {
            await redis.connect();
        }
        return redis;
    };

    // Generic string-key operations: redis.key.get|set|del|exists|expire|ttl
    const keyOps: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
        get: async params => ({value: await redis.get(params.keyName as string)}),
        set: async params => {
            await redis.set(params.keyName as string, params.keyValue as string);
            return {success: true};
        },
        del: async params => ({
            deleted: await redis.del(
                ...((params.keyNames as string[]) ?? [params.keyName as string]),
            ),
        }),
        exists: async params => ({
            exists: (await redis.exists(params.keyName as string)) === 1,
        }),
        expire: async params => ({
            expired: (await redis.expire(params.keyName as string, params.seconds as number)) === 1,
        }),
        ttl: async params => ({ttl: await redis.ttl(params.keyName as string)}),
    };

    // Generic hash operations: redis.hash.getAll|get|set|incrBy|del
    const hashOps: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
        getAll: async params => ({fields: await redis.hgetall(params.keyName as string)}),
        get: async params => ({
            value: await redis.hget(params.keyName as string, params.fieldName as string),
        }),
        set: async params => {
            await redis.hset(
                params.keyName as string,
                params.fieldName as string,
                params.fieldValue as string | number,
            );
            return {success: true};
        },
        incrBy: async params => ({
            value: await redis.hincrby(
                params.keyName as string,
                params.fieldName as string,
                params.increment as number,
            ),
        }),
        del: async params => ({
            deleted: await redis.hdel(
                params.keyName as string,
                ...((params.fieldNames as string[]) ?? [params.fieldName as string]),
            ),
        }),
    };

    // Generic Lua script evaluation: redis.script.eval
    const scriptOps: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
        eval: async params => ({
            result: await redis.eval(
                params.script as string,
                ((params.keyNames as string[]) ?? []).length,
                ...((params.keyNames as string[]) ?? []),
                ...((params.args as unknown[]) ?? []),
            ),
        }),
    };

    return {
        activation: {
            default: {
                type: 'redis',
            },
        },
        async init(...configs: object[]) {
            await super.init(...configs);
            createClient((this.config as {redis?: IConfig}).redis ?? {});
            this.config.context = {...this.config.context, redis};
        },
        start() {
            super.connect();
            return super.start();
        },
        async stop() {
            try {
                await redis?.quit();
            } catch {
                // Best-effort: a lazy client that never connected may reject quit().
            }
            return super.stop();
        },
        /**
         * configChanged hook: only recreate the Redis client when the `redis`
         * connection sub-key changed.  Unrelated config changes are ignored.
         */
        async configChanged(diff: Map<string, {prev: unknown; next: unknown}>, next: unknown) {
            const redisChanged = Array.from(diff.keys()).some(
                (key: string) =>
                    key === this.config.id + '.redis' ||
                    key.startsWith(this.config.id + '.redis.'),
            );
            if (!redisChanged) return;
            const newAdapterConfig = (next as Record<string, unknown>)?.[this.config.id] as
                | {redis?: IConfig}
                | undefined;
            if (newAdapterConfig?.redis) {
                (this.config as {redis?: IConfig}).redis = newAdapterConfig.redis;
                await redis?.quit();
                createClient(newAdapterConfig.redis);
                this.config.context = {...this.config.context, redis};
            }
        },
        async exec(this: Adapter<IConfig>, params: Record<string, unknown>, $meta: IMeta) {
            // Generic redis vocabulary: `redis.<object>.<operation>` where
            // object ∈ {key, hash, script} and operation is the verb, e.g.
            // `redis.key.get`, `redis.hash.getAll`, `redis.script.eval`.
            const parts = ($meta.method ?? '').split('.');
            const object = parts[1];
            const operation = parts[2];
            try {
                await ensureConnected();
                const ops =
                    object === 'key'
                        ? keyOps
                        : object === 'hash'
                          ? hashOps
                          : object === 'script'
                            ? scriptOps
                            : undefined;
                const fn = ops?.[operation];
                if (!fn) throw new Error(`Unknown redis operation: ${object}.${operation}`);
                return await fn(params);
            } catch (error) {
                throw this.error(_errors['redis.unavailable'](error), $meta);
            }
        },
    };
});
