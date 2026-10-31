import type {Adapter, IMeta} from '@feasibleone/blong/types';
import {adapter, type Errors, type IErrorMap} from '@feasibleone/blong/types';
import Redis, {Cluster} from 'ioredis';

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
    /**
     * A channel this adapter subscribes to, and the method a message on it calls.
     *
     * A broker is a wake-up, not a transport: the message becomes one ordinary dispatch, so the realm
     * decides what it means and a message that reaches the wrong process changes nothing (`@@D-709`).
     * A subscriber cannot serve commands on its own connection, so it is a duplicate of the client.
     */
    notify?: {channel?: string; method?: string};
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
    scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(...channels: string[]): Promise<unknown>;
    unsubscribe(...channels: string[]): Promise<unknown>;
    duplicate(): IRedisClient;
    on(event: 'message', listener: (channel: string, message: string) => void): unknown;
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
        list: async params => {
            const pattern = (params.pattern as string) ?? '*';
            const count = (params.count as number) ?? 100;
            const limit = (params.limit as number) ?? 1000;
            const cursor = (params.cursor as string) ?? '0';
            const keyNames: string[] = [];
            let next = cursor;
            do {
                const [newCursor, batch] = await redis.scan(next, 'MATCH', pattern, 'COUNT', count);
                keyNames.push(...batch);
                next = newCursor;
            } while (next !== '0' && keyNames.length < limit);
            return {items: keyNames.slice(0, limit).map(keyName => ({keyName})), cursor: next};
        },
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

    // Publish: `redis.pub.publish` — the outbound half of the notify block above.
    const pubOps: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
        publish: async params => {
            const channel = String(params.channel ?? '');
            if (!channel) throw new Error('redis.pub.publish needs a channel');
            const message =
                typeof params.message === 'string' ? params.message : JSON.stringify(params.message);
            const subscribers = await redis.publish(channel, message);
            return {subscribers};
        },
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
        async start() {
            super.connect();
            const started = super.start();
            const notify = (this.config as {redis?: IConfig}).redis?.notify;
            if (!notify?.channel || !notify.method) return started;
            const self = this as unknown as {
                config: {context?: Record<string, unknown>};
                handle?: (params: unknown, $meta: unknown) => Promise<unknown>;
                log?: {warn?: (entry: unknown) => void};
            };
            try {
                // The duplicate inherits the connection options, including the offline queue this adapter
                // turns off for commands; a subscriber has to connect by itself, so it is switched back on
                // for it alone (`@@T-560`).
                const subscriber = redis.duplicate();
                (subscriber as unknown as {options?: Record<string, unknown>}).options ??= {};
                (
                    subscriber as unknown as {options: Record<string, unknown>}
                ).options.enableOfflineQueue = true;
                subscriber.on('message', (_channel, message) => {
                    let payload: unknown = message;
                    try {
                        payload = JSON.parse(message);
                    } catch {
                        // A plain string is a payload too.
                    }
                    void Promise.resolve(
                        self.handle?.(payload, {method: notify.method, mtid: 'request'}),
                    ).catch(error =>
                        self.log?.warn?.({
                            $meta: {mtid: 'event', method: 'redis.subscribe'},
                            message: `a message on ${notify.channel} did not dispatch: ${String((error as Error)?.message ?? error)}`,
                        }),
                    );
                });
                await subscriber.subscribe(notify.channel);
                self.config.context = {...self.config.context, redisSubscriber: subscriber};
            } catch (error) {
                // A broker that is down must not stop the realm: the wake only shortens a wait that
                // the worker tick ends anyway.
                self.log?.warn?.({
                    $meta: {mtid: 'event', method: 'redis.subscribe'},
                    message: `redis notify channel ${notify.channel} not subscribed: ${String((error as Error)?.message ?? error)}`,
                });
            }
            return started;
        },
        async stop() {
            const subscriber = (this.config as {context?: {redisSubscriber?: IRedisClient}}).context
                ?.redisSubscriber;
            try {
                await subscriber?.quit();
            } catch {
                // A subscriber that never connected has nothing to leave behind.
            }
            try {
                await redis?.quit();
            } catch {
                // Best-effort: a lazy client that never connected may reject quit().
            }
            try {
                // `quit()` waits for the QUIT round-trip and can leave the socket
                // open when the client is mid-connect/reconnect (the commander tap
                // test observed a lingering 6379 socket after stop). `disconnect()`
                // force-closes without waiting, guaranteeing the handle is released.
                (redis as {disconnect?: () => void})?.disconnect?.();
            } catch {
                // ignore
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
                    key === this.config.id + '.redis' || key.startsWith(this.config.id + '.redis.'),
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
                // `{ns}.database.list` — enumerate the logical databases this
                // source exposes (the configured db index).
                if (object === 'database' && operation === 'list') {
                    const db = (this.config as {redis?: IConfig}).redis?.db ?? 0;
                    return {items: [{db}]};
                }
                const ops =
                    object === 'key'
                        ? keyOps
                        : object === 'hash'
                          ? hashOps
                          : object === 'script'
                            ? scriptOps
                            : object === 'pub'
                              ? pubOps
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
