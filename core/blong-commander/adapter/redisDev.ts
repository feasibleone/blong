import {adapter} from '@feasibleone/blong';

/**
 * `redis-dev` adapter instance — Redis explorer source for the commander dev
 * suite. Namespace `redis-dev` so `redis-dev.key.list` /
 * `redis-dev.key.get` reach this instance (connection is lazy + fail-closed).
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
            namespace: 'redis-dev',
            imports: [],
        },
    },
}));
