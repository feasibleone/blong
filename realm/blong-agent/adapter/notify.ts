import {adapter} from '@feasibleone/blong';

/**
 * `adapter/notify.ts` — the wake-up channel, in a namespace of its own (`@@T-560`).
 *
 * The Redis client already lives in `adapter.redis`; what this instance adds is the one thing the
 * framework adapter did not have — a subscription whose messages become calls. A wake is a nudge, not a
 * transport (`@@D-709`): the answer row is the truth, the worker tick is the mechanism, and this only
 * shortens the wait between them.
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
        notify?: {channel?: string; method?: string};
    };
}

export default adapter<INotifyRedisConfig>(() => ({
    extends: 'adapter.redis',
    activation: {
        notify: {
            namespace: 'notify',
            // The method a message on the channel calls is one of this adapter's own: the framework
            // dispatches on the adapter it subscribed with, and forwarding to the realm is the realm's
            // business — `adapter/notify/notifyAnswerWake.ts` does exactly that.
            imports: [/\.notify$/],
            redis: {
                host: '127.0.0.1',
                port: 6379,
                notify: {channel: 'agent.answer.wake', method: 'notify.answer.wake'},
            },
        },
    },
}));
