import {adapter} from '@feasibleone/blong';

/**
 * Redis adapter instance (extends the generic `adapter.redis` base from
 * blong-gogo) used by the integration tests for the adapter's generic
 * vocabulary: `redis.key.*`, `redis.hash.*`, `redis.script.*`.
 *
 * Namespaced `redis` so tests reach it via the handler proxy
 * (`redisKeyGet` → `redis.key.get`, `redisHashGetAll` → `redis.hash.getAll`,
 * `redisScriptEval` → `redis.script.eval`).  Connection is lazy + fail-closed.
 */
export default adapter<{
    redis: {
        host?: string;
        port?: number;
        cluster?: boolean;
        nodes?: Array<{host: string; port: number}>;
        password?: string;
        db?: number;
    };
}>(() => ({
    extends: 'adapter.redis',
    activation: {
        default: {
            redis: {
                host: '127.0.0.1',
                port: 6379,
            },
            namespace: 'redis',
            imports: [],
        },
    },
}));
