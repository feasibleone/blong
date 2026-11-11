import type {
    IChatAccount,
    IChatAccountMap,
    IChatWorkspace,
    IChatWorkspaceMap,
    IMeta,
} from '@feasibleone/blong/types';
import {adapter, type Adapter} from '@feasibleone/blong/types';
import got from 'got';

import {chatAccountsFromDispatch} from '../../chatAccounts.ts';
import {NGROK_AGENT_URL, ngrokPublicUrl, ngrokTunnelsGet} from '../impl/ngrokTunnels.ts';
import {
    slackAppPatch,
    slackManifestDraft,
    slackRotationPatch,
    slackTokenExpiring,
    type ISlackAppCredentials,
    type ISlackTokenRotation,
} from '../impl/slackConfigToken.ts';
import {
    slackManifestPointsAt,
    slackManifestRepoint,
    slackRequestUrl,
    type ISlackManifest,
} from '../impl/slackManifest.ts';

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
    /**
     * The fixed public base every account is reachable at, when a deployment provides one.
     *
     * A tunnel hostname changes between starts and is discovered; a host behind an Ingress does not,
     * and a deployed process has no agent to ask (`@@D-796`). An account's own `publicUrl` wins over
     * this, because one process may publish accounts on two addresses.
     */
    publicUrl?: string;
    accounts?: IChatAccountMap;
    /**
     * The app-configuration credentials of each workspace, by the alias an account names.
     *
     * A Slack configuration token authorizes app management in a workspace, so one pair serves every
     * bot account of that workspace and is stored once — in a database row or here (`@@D-797`). An
     * account's own fields win over this map, so a configured account needs no workspace at all.
     */
    workspaces?: IChatWorkspaceMap;
    /**
     * The method the realm answers the account map with, when accounts are stored rather than
     * configured.
     *
     * Dispatched on start and on every maintenance pass. A map it answers replaces {@link accounts}
     * instead of merging with it — the database is the authority once it holds anything — and an
     * empty answer falls back to the configuration (`@@D-797`).
     */
    accountsMethod?: string;
    /**
     * The method that stores a renewed token pair, and what app creation learned about an app.
     *
     * A rotation spends the refresh token it used, so a port that cannot write the replacement back
     * must not rotate at all: the next start would hold a token Slack has already invalidated. The
     * pair travels with its workspace, which is the row it is written to (`@@D-797`).
     */
    accountsSaveMethod?: string;
    /** How often the accounts are re-read and the apps maintained. `0` turns the pass off. */
    maintainIntervalMs?: number;
}

/** Slack's own API, which the manifest calls always address even when messages go elsewhere. */
const SLACK_API = 'https://slack.com/api/';

/**
 * What every start does for every account: renew the workspace's configuration token, check the bot
 * token, then point the app at the address this process answers on.
 *
 * Every failure is a warning rather than a throw — a process started before the app exists, or before
 * the address answers, still serves what it can, and the next pass retries. The same pass runs on the
 * maintenance interval, which is what lets a long-lived deployment follow a token's expiry without a
 * restart (`@@D-797`).
 */
async function maintainPort(this: Adapter<IConfig>, createApps: boolean): Promise<void> {
    const cfg = this.config as unknown as IConfig;
    const base = cfg.url ?? SLACK_API;
    // The database is the authority once it holds an account, and the configured map is the fallback
    // rather than a second half: merging two sources of one credential is a state nobody can reason
    // about (`@@D-797`).
    const accounts = await resolveAccounts(this, cfg);
    // The token is resolved onto each account so the rest of the pass reads one shape, whichever row
    // the pair actually came from (`@@D-797`).
    for (const [name, account] of Object.entries(accounts)) {
        accounts[name] = {...account, ...credentialOf(cfg, account)};
    }
    cfg.accounts = accounts;
    const renewed = await renewWorkspaces(this, cfg, accounts);
    // One line per pass, because the one question a deployment asks of this port is which accounts
    // it serves: an empty map is the answer a store that is not up yet gives, and it reads exactly
    // like a deployment that configured none.
    this.log?.info?.({
        accountsMethod: cfg.accountsMethod,
        accountCount: Object.keys(accounts).length,
        accounts: Object.keys(accounts),
        message: 'slack port read its accounts',
    });
    // One lookup per pass, not one per account: every account of this port is published by the same
    // listening socket.
    const tunnel = await discoverTunnel(cfg);
    for (const [name, account] of Object.entries(accounts)) {
        const workspace = account.workspace;
        const renewedAccount = workspace ? renewed.get(workspace) : undefined;
        const current = renewedAccount ?? account;
        await checkToken(this, name, current, base);
        const publicBase = publicBaseOf(cfg, current, tunnel);
        if (createApps) await ensureApp(this, cfg, name, current, cfg.path, publicBase);
        else await repointApp(this, name, current, cfg.path, publicBase);
    }
}

/** Reach a method the realm owns — the account store this port is configured with. */
async function dispatchMethod(
    port: Adapter<IConfig>,
    method: string,
    params: unknown,
): Promise<unknown> {
    return (port.dispatch as unknown as (params: unknown, $meta: IMeta) => Promise<unknown>)(
        params,
        {mtid: 'request', method} as IMeta,
    );
}

/**
 * The account map this pass runs with: what the realm stores, else what the configuration names.
 *
 * A store that answers nothing is not an error — a deployment that keeps its credentials in a Secret
 * never configures a store, and the first run of one that does has no rows yet.
 */
async function resolveAccounts(port: Adapter<IConfig>, cfg: IConfig): Promise<IChatAccountMap> {
    const configured = cfg.accounts ?? {};
    if (!cfg.accountsMethod) return configured;
    try {
        const stored = chatAccountsFromDispatch(
            await dispatchMethod(port, cfg.accountsMethod, {platform: 'slack'}),
        );
        return stored ?? configured;
    } catch (error) {
        port.log?.warn?.({message: 'the stored accounts could not be read', error});
        return configured;
    }
}

/**
 * The workspace a token pair is read from, and the alias a replacement is written back under.
 *
 * An account that names no workspace may still be the only one a deployment has, so a single
 * configured workspace serves it — the ordinary local case of one bot and one pair in the rc file.
 */
const workspaceOf = (cfg: IConfig, account: IChatAccount): string | undefined => {
    if (account.workspace) return account.workspace;
    const names = Object.keys(cfg.workspaces ?? {});
    return names.length === 1 ? names[0] : undefined;
};

/** The configuration-token fields an account runs with: its own, else its workspace's. */
const credentialOf = (cfg: IConfig, account: IChatAccount): IChatWorkspace => {
    const workspace = workspaceOf(cfg, account);
    const stored = workspace ? cfg.workspaces?.[workspace] : undefined;
    return {
        ...(stored?.configToken !== undefined && {configToken: stored.configToken}),
        ...(stored?.configRefreshToken !== undefined && {
            configRefreshToken: stored.configRefreshToken,
        }),
        ...(stored?.configTokenExpiresAt !== undefined && {
            configTokenExpiresAt: stored.configTokenExpiresAt,
        }),
        ...(account.configToken !== undefined && {configToken: account.configToken}),
        ...(account.configRefreshToken !== undefined && {
            configRefreshToken: account.configRefreshToken,
        }),
        ...(account.configTokenExpiresAt !== undefined && {
            configTokenExpiresAt: account.configTokenExpiresAt,
        }),
    };
};

/**
 * Renew each workspace's configuration token once, when it is close to its expiry, and store the pair
 * Slack answers.
 *
 * Once per **workspace**, not once per account: the pair is shared, and a rotation spends the refresh
 * token it was given, so a second account of the same workspace renewing in the same pass would send a
 * token that no longer works. A rotation also has to be written back before the next start reads the
 * old one, so a pair with nowhere to store its replacement is left alone and the pass says so
 * (`@@D-797`). The rotation endpoint is Slack's own even when an account's `url` names a simulator — a
 * configuration token is not a message.
 */
async function renewWorkspaces(
    port: Adapter<IConfig>,
    cfg: IConfig,
    accounts: IChatAccountMap,
): Promise<Map<string, IChatAccount>> {
    const renewed = new Map<string, IChatAccount>();
    const groups = new Map<string, {names: string[]; account: IChatAccount}>();
    for (const [name, account] of Object.entries(accounts)) {
        const workspace = workspaceOf(cfg, account);
        if (!workspace) continue;
        const group = groups.get(workspace);
        if (group) group.names.push(name);
        else groups.set(workspace, {names: [name], account});
    }
    for (const [workspace, {names, account}] of groups) {
        if (!account.configRefreshToken) continue;
        if (!slackTokenExpiring(account.configTokenExpiresAt)) continue;
        if (!cfg.accountsSaveMethod) {
            port.log?.warn?.({
                workspace,
                accounts: names,
                message:
                    'the configuration token is due for renewal, but no account store can keep ' +
                    'the replacement, so it was left as it is',
            });
            continue;
        }
        try {
            const answer = await got.post(new URL('tooling.tokens.rotate', SLACK_API), {
                form: {refresh_token: account.configRefreshToken},
                responseType: 'json',
                throwHttpErrors: false,
            });
            const rotation = answer.body as ISlackTokenRotation | undefined;
            const patch = slackRotationPatch(rotation);
            if (!patch.configToken) {
                port.log?.warn?.({
                    workspace,
                    message: rotation?.error ?? 'the configuration token was not renewed',
                });
                continue;
            }
            try {
                await dispatchMethod(port, cfg.accountsSaveMethod, {
                    platform: 'slack',
                    workspace,
                    ...patch,
                });
            } catch (error) {
                // The in-memory pair is still the one Slack will accept until it expires again, so the
                // pass continues; the warning is what says the next start will read a spent token.
                port.log?.warn?.({
                    workspace,
                    message: 'the renewed configuration token could not be stored',
                    error,
                });
            }
            port.log?.info?.({
                workspace,
                accounts: names,
                message: 'slack configuration token renewed',
            });
            renewed.set(workspace, {...account, ...patch});
        } catch (error) {
            port.log?.warn?.({workspace, message: 'the token renewal failed', error});
        }
    }
    return renewed;
}

/**
 * Create the app an account names no id for, then point it at this process.
 *
 * A manifest that carried the request URL would have to name the app and the client before Slack has
 * created either, so the app is created bare and read back with the ids it was given — the same
 * re-point an existing app gets (`@@D-796`). What creation answered is stored beside the token, so
 * the signing secret a new app is born with reaches the inbound half.
 */
async function ensureApp(
    port: Adapter<IConfig>,
    cfg: IConfig,
    name: string,
    account: IChatAccount,
    path: string | undefined,
    publicBase: string | undefined,
): Promise<void> {
    if (account.appId) return repointApp(port, name, account, path, publicBase);
    if (!account.configToken) return;
    if (!publicBase) {
        port.log?.warn?.({
            account: name,
            message: 'no public address publishes this port, so no Slack app was created',
        });
        return;
    }
    try {
        const answer = await got.post(new URL('apps.manifest.create', SLACK_API), {
            headers: {authorization: `Bearer ${account.configToken}`},
            json: {manifest: JSON.stringify(slackManifestDraft(name))},
            responseType: 'json',
            throwHttpErrors: false,
        });
        const created = answer.body as
            | (ISlackAppCredentials & {ok?: boolean; error?: string})
            | undefined;
        if (created?.ok === false) {
            port.log?.warn?.({
                account: name,
                message: created.error ?? 'the Slack app was not created',
            });
            return;
        }
        const patch = slackAppPatch(created);
        if (!patch.appId) {
            port.log?.warn?.({account: name, message: 'the Slack app creation answered no app id'});
            return;
        }
        if (cfg.accountsSaveMethod) {
            try {
                await dispatchMethod(port, cfg.accountsSaveMethod, {
                    platform: 'slack',
                    alias: name,
                    ...patch,
                });
            } catch (error) {
                port.log?.warn?.({
                    account: name,
                    message: 'the created Slack app could not be stored',
                    error,
                });
            }
        }
        port.log?.info?.({account: name, appId: patch.appId, message: 'slack app was created'});
        await repointApp(port, name, {...account, ...patch}, path, publicBase);
    } catch (error) {
        port.log?.warn?.({account: name, message: 'the Slack app creation failed', error});
    }
}

/**
 * The public base this account answers on.
 *
 * An account's own address wins, then one it named for a tunnel, and only an account that talks to
 * Slack itself may fall back to the deployment's address or the agent's answer. An account that names
 * its own `url` is talking to something other than Slack — a simulator, a proxy — so nothing public
 * publishes it (`@@D-688` `@@D-796`).
 */
const publicBaseOf = (
    cfg: IConfig,
    account: IChatAccount,
    discovered: string | undefined,
): string | undefined =>
    account.publicUrl ??
    account.ngrokUrl ??
    (account.url ? undefined : (cfg.publicUrl ?? discovered));

/**
 * The tunnel the agent is forwarding this port to, when one is running.
 *
 * Cached for the pass rather than per account, and silent when no agent answers: a deployment that is
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
    publicBase: string | undefined,
): Promise<void> {
    const {configToken, appId} = account;
    if (!configToken || !appId || !path) return;
    if (!publicBase) {
        port.log?.warn?.({
            account: name,
            message: 'no public address publishes this port, so the Slack app was left as it was',
        });
        return;
    }
    const ngrokUrl = publicBase;
    try {
        await got.get(ngrokUrl, {
            throwHttpErrors: false,
            timeout: {request: 5000},
            headers: {'ngrok-skip-browser-warning': 'true'},
        });
    } catch (error) {
        port.log?.warn?.({
            account: name,
            publicUrl: ngrokUrl,
            message: 'the public address does not answer yet',
            error,
        });
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
                message: 'slack app already points at its public address',
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
        port.log?.info?.({
            account: name,
            requestUrl,
            message: 'slack app points at its public address',
        });
    } catch (error) {
        port.log?.warn?.({account: name, message: 'the manifest update failed', error});
    }
}

/** How often a long-lived deployment re-reads its accounts, unless it names an interval. */
const DEFAULT_MAINTAIN_INTERVAL_MILLIS = 3_600_000;

/**
 * How long a started port waits before asking a store that answered nothing a second time.
 *
 * The first pass runs while the rest of the process is still starting, and the store it reads lives
 * in another adapter: a database that has not connected yet answers no accounts, which is the same
 * answer as a deployment that configured none. One retry covers that window without turning a
 * genuinely empty store into a loop.
 */
const STORE_RETRY_MILLIS = 15_000;

export default adapter<IConfig>(() => {
    let maintenance: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const stopMaintenance = (): void => {
        if (retry !== undefined) {
            clearTimeout(retry);
            retry = undefined;
        }
        if (maintenance === undefined) return;
        clearInterval(maintenance);
        maintenance = undefined;
    };
    return {
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
                imports: [/\.slack$/],
                accounts: {},
                maintainIntervalMs: DEFAULT_MAINTAIN_INTERVAL_MILLIS,
            },
        },
        /**
         * Read the accounts, renew what is due, and point every app at the address this process
         * answers on — once at start, which may also create an app an account has no id for, and then
         * on the maintenance interval, which only maintains what exists.
         *
         * A token rotation the configuration did not follow failed on the first message a person sent,
         * which is the worst place to learn it, so `auth.test` runs once per account. The manifest
         * half is what makes a deployment usable: the two request URLs Slack posts to are app
         * settings, and a process that restarts or outlives a token renewal rewrites them here after
         * checking that the public address actually answers (`@@D-688`).
         *
         * Every failure is a warning rather than a throw: a process started before the app exists, or
         * before its address answers, still serves what it can, and the next pass retries.
         */
        async ready(this: Adapter<IConfig>) {
            const result = await super.ready();
            await maintainPort.call(this, true);
            const cfg = this.config as unknown as IConfig;
            // A store that answered nothing may simply not be up yet, so the pass is repeated once
            // before the hourly interval takes over.
            if (cfg.accountsMethod && !Object.keys(cfg.accounts ?? {}).length) {
                retry = setTimeout(() => {
                    retry = undefined;
                    maintainPort.call(this, true).catch(error => this.log?.warn?.(error));
                }, STORE_RETRY_MILLIS);
                retry.unref?.();
            }
            const interval = cfg.maintainIntervalMs ?? DEFAULT_MAINTAIN_INTERVAL_MILLIS;
            if (interval > 0) {
                stopMaintenance();
                maintenance = setInterval(() => {
                    maintainPort.call(this, false).catch(error => this.log?.warn?.(error));
                }, interval);
                // A maintenance timer is work the process does, not a reason to keep it alive: a test
                // run and a short-lived CLI both stop the port themselves.
                maintenance.unref?.();
            }
            return result;
        },
        async stop(this: Adapter<IConfig>) {
            stopMaintenance();
            return super.stop();
        },
    };
});
