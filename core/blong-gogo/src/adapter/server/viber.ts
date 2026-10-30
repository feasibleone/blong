import type {IChatAccountMap} from '@feasibleone/blong/types';
import {adapter, type Adapter} from '@feasibleone/blong/types';
import got from 'got';

import {chatPublicUrl} from '../../chatAccounts.ts';
import {NGROK_AGENT_URL, ngrokPublicUrl, ngrokTunnelsGet} from './ngrokTunnels.ts';

/**
 * viber.ts — the Viber port.
 *
 * The same two directions as Slack, against a smaller API: `send_message` posts, `set_webhook` names
 * the address messages arrive at, and a request is verified by an HMAC of its own bytes keyed by the
 * bot's auth token (`@@D-676`). Viber renders keyboard buttons rather than a form, so the capability
 * that is missing is refused there rather than imitated (`@@D-678`).
 *
 * The webhook is registered from `ready` rather than from a deployment step: the address is the one
 * this process just listened on, and an ngrok hostname changes between runs more often than anything
 * else here (`@@D-677`).
 */
export interface IConfig {
    url?: string;
    path?: string;
    server?: {host?: string; port?: number};
    /** Where the ngrok agent answers, when it is not the default `127.0.0.1:4040`. */
    ngrokAgentUrl?: string;
    accounts?: IChatAccountMap;
}

/** The events a bridge needs; anything more is a subscription nobody reads. */
const EVENT_TYPES = ['message', 'conversation_started', 'delivered', 'seen', 'failed'];

export default adapter<IConfig>(() => ({
    extends: 'adapter.webhook',
    activation: {
        default: {
            type: 'viber',
            url: 'https://chatapi.viber.com/pa/',
            listen: true,
            path: '/chat/viber/{appId}/{clientId}',
            hook: 'viberIn',
            namespace: 'viber',
            // Viber also wants its answer quickly, and it wants `{status: 0}` in the body.
            mode: 'server',
            server: {port: 8096},
            response: {code: 200, body: {status: 0}},
            destination: 'chat.in.receive',
            imports: [/viberIn$/, /\.viber$/],
            accounts: {},
        },
    },
    /**
     * Register the public address of every account that names one.
     *
     * A failure is logged rather than thrown: a process started before the bot exists, or with a
     * hostname that has not been pointed at it yet, should still serve what it can, and the next
     * restart retries the registration.
     */
    async ready(this: Adapter<IConfig>) {
        const result = await super.ready();
        const cfg = this.config as unknown as IConfig;
        const base = cfg.url ?? 'https://chatapi.viber.com/pa/';
        // The tunnel that forwards this listener, asked once: an ngrok hostname changes more often
        // than anything else in a local run, and this is what keeps `set_webhook` in step with it.
        const discovered = cfg.server?.port
            ? ngrokPublicUrl(
                  await ngrokTunnelsGet(cfg.ngrokAgentUrl ?? NGROK_AGENT_URL),
                  cfg.server.port,
              )
            : undefined;
        await Promise.all(
            Object.entries(cfg.accounts ?? {}).map(async ([name, account]) => {
                if (!account.authToken) return;
                // `webhookUrl` is the address outright, `ngrokUrl` a fixed base, and an account that
                // names neither takes the agent's answer — unless it talks to its own `url`, which
                // means it is a simulator and nothing publishes it.
                const publicBase = account.ngrokUrl ?? (account.url ? undefined : discovered);
                const webhookUrl =
                    account.webhookUrl ??
                    (publicBase && cfg.path
                        ? chatPublicUrl(cfg.path, publicBase, account)
                        : undefined);
                if (!webhookUrl) return;
                try {
                    const answer = await got.post(new URL('set_webhook', base), {
                        json: {
                            auth_token: account.authToken,
                            url: webhookUrl,
                            event_types: EVENT_TYPES,
                        },
                        responseType: 'json',
                        throwHttpErrors: false,
                    });
                    const body = answer.body as {status?: number; status_message?: string};
                    if (body?.status !== 0)
                        this.log?.warn?.({
                            account: name,
                            status: body?.status,
                            message: body?.status_message,
                        });
                } catch (error) {
                    this.log?.warn?.(error);
                }
            }),
        );
        return result;
    },
}));
