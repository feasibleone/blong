import type {IChatAccount, IChatAccountMap} from '@feasibleone/blong/types';
import {adapter, type Adapter} from '@feasibleone/blong/types';
import got from 'got';

import {NGROK_AGENT_URL, ngrokPublicUrl, ngrokTunnelsGet} from './ngrokTunnels.ts';
import {
    slackManifestPointsAt,
    slackManifestRepoint,
    slackRequestUrl,
    type ISlackManifest,
} from './slackManifest.ts';

/**
 * slack.ts — the Slack port.
 *
 * Two directions on one port: the posting half of `adapter.webhook` calls the Web API with a bare
 * descriptor (`chat.postMessage`, `views.open`, `auth.test`), and the receiving half answers the
 * Events API and Interactivity at one path. The protocol lives here and in the two handler groups
 * beside it — Block Kit and the signature never reach the realm (`@@D-676`).
 *
 * The port replaces the prototype that wrapped `@slack/webhook`: that client posts through its own
 * server, which is why the prototype could neither receive nor log a request, and no part of it is
 * worth keeping.
 */
export interface IConfig {
    url?: string;
    path?: string;
    server?: {host?: string; port?: number};
    /**
     * Where the ngrok agent answers, when it is not the default `127.0.0.1:4040`.
     *
     * The agent is per machine while a listening port is per port, so this is a port setting: it
     * is what tells the port which tunnels it could be published by.
     */
    ngrokAgentUrl?: string;
    accounts?: IChatAccountMap;
}

/** Slack's own API, which the manifest calls always address even when messages go elsewhere. */
const SLACK_API = 'https://slack.com/api/';

/**
 * What every start does for every account: check the token, then re-point the app at the tunnel.
 *
 * Both are warnings rather than throws — a process started before the app exists, or before the tunnel
 * is up, still serves what it can, and the next restart retries.
 */
async function readyPort(this: Adapter<IConfig>): Promise<void> {
    const cfg = this.config as unknown as IConfig;
    const base = cfg.url ?? SLACK_API;
    // One lookup per start, not one per account: every account of this port is published by the same
    // tunnel, because it is the same listening socket.
    const tunnel = await discoverTunnel(cfg);
    await Promise.all(
        Object.entries(cfg.accounts ?? {}).map(async ([name, account]) => {
            await checkToken(this, name, account, base);
            await repointApp(this, name, account, cfg.path, tunnel);
        }),
    );
}

/**
 * The tunnel the agent is forwarding this port to, when one is running.
 *
 * Cached for the start rather than per account, and silent when no agent answers: a deployment that is
 * published by a Service needs no tunnel, and one started before `ngrok` still serves what it can.
 */
async function discoverTunnel(cfg: IConfig): Promise<string | undefined> {
    const port = cfg.server?.port;
    if (!port) return undefined;
    return ngrokPublicUrl(await ngrokTunnelsGet(cfg.ngrokAgentUrl ?? NGROK_AGENT_URL), port);
}

/** `auth.test`, which is the cheapest way to learn that a bot token no longer works. */
async function checkToken(
    port: Adapter<IConfig>,
    name: string,
    account: IChatAccount,
    base: string,
): Promise<void> {
    if (!account.botToken) return;
    try {
        const answer = await got.post(new URL('auth.test', base), {
            headers: {authorization: `Bearer ${account.botToken}`},
            responseType: 'json',
            throwHttpErrors: false,
        });
        const body = answer.body as {ok?: boolean; error?: string} | undefined;
        if (body?.ok === false)
            port.log?.warn?.({account: name, message: body.error ?? 'auth.test failed'});
    } catch (error) {
        port.log?.warn?.(error);
    }
}

/**
 * Point the app's Event Subscriptions and Interactivity at the tunnel this account answers on.
 *
 * The address is the agent's answer — the tunnel whose local port is this listener's — and
 * `ngrokUrl` on the account overrides it for an agent elsewhere or a fixed hostname. An account that
 * names its own `url` is talking to something other than Slack (a simulator, a proxy), so it is not
 * repointed at all. The tunnel is probed first: Slack validates a request URL by calling it, so
 * offering it an address ngrok is not serving yet fails the update and leaves the app pointed at
 * yesterday's hostname. The manifest is read before it is written, and one that already names that
 * address is left alone — the write is tightly rate-limited and a restart on an unchanged hostname
 * would spend it repeating itself (`@@D-688`).
 */
async function repointApp(
    port: Adapter<IConfig>,
    name: string,
    account: IChatAccount,
    path: string | undefined,
    discovered: string | undefined,
): Promise<void> {
    const {configToken, appId} = account;
    if (!configToken || !appId || !path) return;
    const ngrokUrl = account.ngrokUrl ?? (account.url ? undefined : discovered);
    if (!ngrokUrl) {
        port.log?.warn?.({
            account: name,
            message: 'no tunnel publishes this port, so the Slack app was left as it was',
        });
        return;
    }
    try {
        await got.get(ngrokUrl, {
            throwHttpErrors: false,
            timeout: {request: 5000},
            headers: {'ngrok-skip-browser-warning': 'true'},
        });
    } catch (error) {
        port.log?.warn?.({account: name, ngrokUrl, message: 'ngrok does not answer yet', error});
        return;
    }
    const headers = {authorization: `Bearer ${configToken}`};
    try {
        const exported = await got.post(new URL('apps.manifest.export', SLACK_API), {
            headers,
            json: {app_id: appId},
            responseType: 'json',
            throwHttpErrors: false,
        });
        const read = exported.body as {ok?: boolean; error?: string; manifest?: ISlackManifest};
        if (read?.ok === false || !read?.manifest) {
            port.log?.warn?.({
                account: name,
                message: read?.error ?? 'the manifest could not be read',
            });
            return;
        }
        const requestUrl = slackRequestUrl(path, ngrokUrl, account);
        // A restart on a hostname that has not changed has nothing to write, and `apps.manifest.update`
        // is one of the most tightly rate-limited calls Slack has.
        if (slackManifestPointsAt(read.manifest, requestUrl)) {
            port.log?.info?.({
                account: name,
                requestUrl,
                message: 'slack app already points at the tunnel',
            });
            return;
        }
        const updated = await got.post(new URL('apps.manifest.update', SLACK_API), {
            headers,
            json: {
                app_id: appId,
                manifest: JSON.stringify(slackManifestRepoint(read.manifest, requestUrl)),
            },
            responseType: 'json',
            throwHttpErrors: false,
        });
        const answer = updated.body as {ok?: boolean; error?: string};
        if (answer?.ok === false) {
            port.log?.warn?.({
                account: name,
                requestUrl,
                message: answer.error ?? 'the manifest was refused',
            });
            return;
        }
        port.log?.info?.({account: name, requestUrl, message: 'slack app points at the tunnel'});
    } catch (error) {
        port.log?.warn?.({account: name, message: 'the manifest update failed', error});
    }
}

export default adapter<IConfig>(() => ({
    extends: 'adapter.webhook',
    activation: {
        default: {
            type: 'slack',
            // A trailing slash matters: `new URL('chat.postMessage', base)` treats a base without one
            // as a file name and drops its last segment.
            url: 'https://slack.com/api/',
            listen: true,
            path: '/chat/slack/{appId}/{clientId}/{action?}',
            hook: 'slackIn',
            namespace: 'slack',
            // Slack wants an answer inside three seconds; the realm's processing runs on after it.
            mode: 'server',
            server: {port: 8095},
            response: {code: 200, body: 'EVENT_RECEIVED'},
            destination: 'chat.in.receive',
            imports: [/slackIn$/, /\.slack$/],
            accounts: {},
        },
    },
    /**
     * Ask the API who each token belongs to, and re-point the app when a tunnel address follows it.
     *
     * A rotated token the configuration did not follow failed on the first message a person sent,
     * which is the worst place to learn it, so `auth.test` runs once per account. The manifest half is
     * what makes a local run usable: an ngrok hostname changes between restarts, and the two request
     * URLs Slack posts to are app settings — so an account that names `ngrokUrl` and a configuration
     * token has them rewritten here, after checking that the tunnel actually answers (`@@D-688`).
     *
     * Every failure is a warning rather than a throw: a process started before the app exists, or
     * before the tunnel is up, still serves what it can, and the next restart retries.
     */
    async ready(this: Adapter<IConfig>) {
        const result = await super.ready();
        await readyPort.call(this);
        return result;
    },
}));
