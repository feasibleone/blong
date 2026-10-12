import type {IMeta} from '@feasibleone/blong/types';
import got, {type HTTPAlias, type Headers} from 'got';
import busGateway from './busGateway.ts';
import jose from './jose.ts';
import oidc from './oidc.ts';

import type {IResolution} from './Resolution.ts';
import tls from './tls.ts';

type Protocol = 'http' | 'https';
export interface IGatewayCodec {
    gateway: ($meta: object, methodName: string) => object | void;
    codec: (
        $meta: object,
        methodType: 'request' | 'publish',
    ) => Promise<{
        encode: (...params: unknown[]) => Promise<{
            params: object;
            headers?: object;
            method?: string;
        }>;
        decode: (result: unknown, unpack?: boolean) => Promise<unknown>;
        requestParams: {
            protocol: Protocol;
            hostname: string;
            port: string;
            path: string;
            cache?: string;
            namespace?: string;
        };
    }>;
    verify: (
        token: string,
        flags: {nonce?: string; audience: string},
        isId?: boolean,
    ) => Promise<object>;
}

export interface IConfig {
    client?: {tls?: {ca?: string | string[]; key?: string; cert?: string; crl?: string}};
    gateway?: object;
    /**
     * Whether a method must *not* be carried by the gateway this config names: `true` for every method,
     * `false` for none, or a regular-expression *source* matched against the method name for the ones
     * that belong here.
     *
     * The routing decision is made here — a gateway is where an *outside* caller reaches a process, and
     * `gateway()` is what says whether a call is handed to one — so this is where a method that has to
     * be answered at home is kept out of it. The name the framework needs it for is its own session
     * check: `identity.checkInternal` is asked by the process that verified the token, from inside that
     * verification, and a realm that answers its own login is one process. Routed through a gateway the
     * call reached the gateway itself, was refused for a missing bearer and came back as a null the
     * session step destructured (F-497) — a hardcoded name here until this setting replaced it, because
     * a deployment that routes namespaces through a gateway is the one that knows which of its own
     * methods have to stay home.
     *
     * A skipped method falls back to the ordinary path, and what that resolves to is the resolver's
     * answer: `remote.canSkipSocket` decides whether the process answers it in-process or sends it to
     * the namespace. The two settings compose rather than overlap — this one says "not through the
     * gateway", that one says "answered here" — which is why the resolver asks its question only after
     * this one has let the call through.
     */
    skipGateway?: boolean | string;
    protocol?: Protocol;
    host?: string;
    port?: string;
    service?: string;
    openId?: unknown;
    blongLogin?: unknown;
}

type Sender = (a: unknown, b: unknown) => Promise<unknown>;

export default class GatewayCodecImpl implements IGatewayCodec {
    #gatewayCodec: Promise<ReturnType<typeof busGateway>>;
    #protocol: Protocol;
    #port: string;
    #config: IConfig;
    #tlsClient: object;
    #resolution: IResolution;
    /**
     * The `skipGateway` source as it was compiled, and the pattern — `null` for a source that did not
     * compile.
     *
     * Kept beside the source for the reason the resolver keeps its own: `gateway()` runs for every
     * outgoing call, and compiling the same expression per call is work that only the first call needs.
     */
    #skipGateway: {source: boolean | string; pattern: RegExp | null} | undefined;

    public verify!: IGatewayCodec['verify'];

    public constructor(
        config: IConfig,
        protocol: Protocol,
        port: string,
        errors: unknown,
        sender: Sender,
        resolution: IResolution,
    ) {
        this.#config = config;
        this.#protocol = protocol;
        this.#port = port;
        this.#tlsClient = tls(this.#config.client ?? {}, true) as object;
        this.#resolution = resolution;

        async function session(token: {
            oid?: string;
            sub?: string;
            per?: string;
            ses?: string;
            enc?: object;
            sig?: object;
        }): Promise<void> {
            const result = (await sender(
                {
                    username: token.oid || token.sub,
                    installationId: token.oid || token.sub,
                    type: 'oidc',
                    password: '*',
                    channel: 'web',
                },
                {method: 'identity.checkInternal'},
            )) as [
                {
                    'identity.check': {
                        actorId: unknown;
                        sessionId: string;
                    };
                    permissionMap: string;
                    mle?: {
                        mlek: string;
                        mlsk: string;
                    };
                },
            ];
            const [
                {
                    'identity.check': {actorId, sessionId},
                    permissionMap,
                    mle,
                },
            ] = result;
            if (token) {
                token.per = permissionMap;
                token.ses = sessionId;
                if (mle && mle.mlek) token.enc = JSON.parse(mle.mlek);
                if (mle && mle.mlsk) token.sig = JSON.parse(mle.mlsk);
                token.sub = String(actorId);
            }
        }

        const {verify, get} = oidc({
            async request(
                {
                    json,
                    method,
                    url,
                    headers,
                }: {
                    json: unknown;
                    method: HTTPAlias;
                    url: string;
                    headers: Headers;
                },
                callback: (error: Error | null, response?: unknown, body?: unknown) => void,
            ) {
                try {
                    const response = await got(url, {
                        method,
                        headers,
                        responseType: json ? 'json' : undefined,
                    });
                    if (response.request) Object.assign(response.request, {method, href: url});
                    callback(null, response, response.body);
                } catch (error) {
                    callback(error as Error);
                }
            },
            discoverService: this._discoverService.bind(this),
            errorPrefix: 'rpc.',
            errors: errors as never,
            session,
            tls: this.#tlsClient,
            issuers: (config.openId || {
                ...(config.blongLogin !== false && {'blong-login': {audience: 'blong'}}),
            }) as unknown as Record<string, false | {[key: string]: unknown}>,
        } as unknown as Parameters<typeof oidc>[0]);

        this.#gatewayCodec = (async () => {
            const mleClient = await jose((config.client || {}) as Parameters<typeof jose>[0]);
            return busGateway({
                errorPrefix: 'rpc.',
                serverInfo: (key: 'protocol' | 'port') => ({protocol, port})[key],
                mleClient: mleClient as never,
                errors: errors as never,
                get: get as never,
            } as never) as unknown as ReturnType<typeof busGateway>;
        })();

        this.verify = verify as IGatewayCodec['verify'];
    }

    /**
     * Whether this call is one the gateway must not carry ({@link IConfig.skipGateway}).
     *
     * A source that does not compile is treated as nothing matching rather than as every method: a typo
     * in a config must not decide that no call is ever routed, and the alternative — refusing to start —
     * would take a deployment down over a string. Nothing is logged here because this class has no
     * logger: it is handed one by the caller that owns the logs, and the silent treatment is the same
     * answer `Remote.canAnswerLocally` reports through its own.
     */
    private _skipsGateway(methodName: string): boolean {
        const {skipGateway} = this.#config;
        if (skipGateway === true) return true;
        if (typeof skipGateway !== 'string') return false;
        if (this.#skipGateway?.source !== skipGateway) {
            let pattern: RegExp | null = null;
            try {
                pattern = new RegExp(skipGateway);
            } catch {
                pattern = null;
            }
            this.#skipGateway = {source: skipGateway, pattern};
        }
        return this.#skipGateway.pattern?.test(methodName) ?? false;
    }

    public gateway($meta: IMeta, methodName: string = $meta.method!): object | void {
        // A skipped method does not reach a gateway at all, not even one the caller asked for in
        // `$meta.gateway`: the setting says this process answers the call, and what answers it is the
        // resolver's business (see `IConfig.skipGateway`).
        if (this._skipsGateway(methodName)) return undefined;
        if (this.#config.gateway) {
            const gw = this.#config.gateway as Record<string, unknown>;
            const [prefix, method] = methodName.split('/');
            if (method) {
                if (gw[prefix]) return {...(gw[prefix] as object), ...$meta.gateway, method};
            } else {
                const [namespace] = prefix.split('.');
                const gwEntry = gw[namespace] || gw[prefix];
                if (gwEntry) return {...(gwEntry as object), ...$meta.gateway, method: prefix};
            }
        }

        if ($meta.gateway) return {...$meta.gateway, method: methodName};
    }

    public async codec(
        $meta: IMeta,
        methodType: 'request' | 'publish',
    ): ReturnType<IGatewayCodec['codec']> {
        const gatewayConfig = this.gateway($meta);

        if (gatewayConfig)
            return (await this.#gatewayCodec)(gatewayConfig as never) as unknown as Awaited<
                ReturnType<IGatewayCodec['codec']>
            >;

        const [namespace, event] = $meta.method!.split('.');

        const op = ['start', 'stop', 'drain'].includes(event) ? event : methodType;

        return {
            encode: async (...params) => ({params}),
            decode: async result => result,
            requestParams: {
                ...(await this._discoverService('rpc-' + namespace)),
                path: `/rpc/ports/${namespace}/${op}`,
            },
        };
    }

    private async _discoverService(namespace: string): Promise<{
        protocol: Protocol;
        hostname: string;
        port: string;
        service: string;
    }> {
        const serviceName = namespace.replace(/\//g, '-');
        const params = {
            protocol: this.#config.protocol || this.#protocol,
            hostname: this.#config.host || serviceName,
            port: this.#config.port || this.#port,
            service: this.#config.service!,
        };
        const requestParams = Object.assign({}, params);
        if (this.#resolution)
            Object.assign(
                requestParams,
                await this.#resolution.resolve(serviceName, false, namespace),
            );
        return requestParams;
    }
}
