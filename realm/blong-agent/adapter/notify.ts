import {adapter} from '@feasibleone/blong';

/**
 * `adapter/notify.ts` — the wake-up channel, in a namespace of its own (`@@T-560`).
 *
 * A wake is a nudge, not a transport (`@@D-709`): the answer row is the truth, the worker tick is
 * the mechanism, and the broker only shortens the wait between them. The instance holds the
 * connection and nothing else — publishing is `notify.pub.publish`, and the channel is read through
 * `notify.sub.watch`, which answers a sequence rather than dispatching anything. The caller is
 * therefore the one that decides what a message means, and that caller is the realm's orchestrator,
 * which opens the subscription in its `ready()` (`@@T-816`, `@@D-1013`).
 *
 * It loads under the `notify` intent alone. A deployment without a broker runs without a connection to
 * one, and a broker that is down is a warning at boot rather than a realm that does not start.
 */
export interface INotifyRedisConfig {
    redis?: {
        host?: string;
        port?: number;
        db?: number;
        password?: string;
    };
}

export default adapter<INotifyRedisConfig>(() => ({
    extends: 'adapter.redis',
    activation: {
        notify: {
            namespace: 'notify',
            redis: {
                host: '127.0.0.1',
                port: 6379,
            },
        },
    },
}));
