import type {Adapter, Errors, IErrorMap, IMeta} from '@feasibleone/blong/types';
import {adapter} from '@feasibleone/blong/types';
import ky, {type Options as KyOptions} from 'ky';

export interface IConfig {
    tls?: {
        key?: string;
        cert?: string;
        ca?: string | string[];
        crl?: string;
    };
    url?: string;
    /** Alternative to `url`: construct the base URL from these parts.
     *  The `port` value may be a Promise (e.g. from a manifest property)
     *  that resolves to the effective port number. */
    port?: number | Promise<number>;
    host?: string;
    protocol?: string;
}

const errorMap: IErrorMap = {
    'http.generic': 'HTTP Error',
};

let _errors: Errors<typeof errorMap>;
const undici = 'undici';
const nodeFs = 'node:fs';

export default adapter<IConfig>(({utError, manifest}) => {
    _errors ||= utError.register(errorMap);

    let kyInstance: typeof ky = ky;
    return {
        activation: {
            default: {
                type: 'http',
            },
        },
        async init(...configs: object[]) {
            await super.init(...configs);
            // If port/host/protocol are provided instead of url, and the port
            // value is already a plain number (e.g. from CLI --manifest.gatewayPort=8080),
            // construct the URL straight away.  Promise values (dynamic manifest
            // ports) are resolved lazily on first exec() call.
            if (!this.config.url && this.config.host && this.config.port != null) {
                const portCandidate = this.config.port;
                if (typeof portCandidate === 'number' || typeof portCandidate === 'string') {
                    const protocol = this.config.protocol || 'http';
                    this.config.url = `${protocol}://${this.config.host}:${portCandidate}`;
                }
            }
            if (this.config.tls) {
                // Dynamic imports — only run on the server; @vite-ignore prevents
                // Vite from trying to bundle these Node.js-only modules for the browser.
                const [{Agent}, {readFileSync}] = await Promise.all([
                    import(/* @vite-ignore */ undici) as Promise<typeof import('undici')>,
                    import(/* @vite-ignore */ nodeFs) as Promise<typeof import('node:fs')>,
                ]);
                const {tls} = this.config;
                const agent = new Agent({
                    connect: {
                        minVersion: 'TLSv1.3',
                        ...(tls.key && {key: readFileSync(tls.key)}),
                        ...(tls.cert && {cert: readFileSync(tls.cert)}),
                        ...(tls.ca && {
                            ca: Array.isArray(tls.ca)
                                ? tls.ca.map(f => readFileSync(f))
                                : readFileSync(tls.ca),
                        }),
                        ...(tls.crl && {crl: readFileSync(tls.crl)}),
                    },
                });
                kyInstance = ky.create({
                    fetch: (url, options) =>
                        fetch(url as string, {
                            ...(options as RequestInit),
                            // @ts-expect-error: undici dispatcher is not in the standard RequestInit type
                            dispatcher: agent,
                        }),
                });
            }
        },
        start() {
            super.connect();
            return super.start();
        },
        async exec(
            this: Adapter<IConfig>,
            {
                path,
                query: searchParams,
                url,
                responseType,
                method,
                headers,
                body,
                form,
                json,
            }: {
                path: string;
                query: string | Record<string, string>;
                url?: URL;
                responseType: 'json' | 'text' | 'buffer';
                method: string;
                headers: Record<string, string>;
                body: BodyInit;
                form: Record<string, string>;
                json: unknown;
            },
            $meta: IMeta,
        ) {
            try {
                // Lazily resolve the base URL when not yet available.
                // Resolution priority:
                //   1. Manifest gatewayPort (set by server-side Gateway after start)
                //   2. Config port/host/protocol (from realm factory)
                //   3. Config url (hardcoded fallback like 'http://localhost:8080')
                if (!url) {
                    let baseUrl: string | undefined;
                    if (this.config.host) {
                        // `await` handles plain values, promises and undefined alike
                        const manifestPort = manifest ? await manifest.gatewayPort : undefined;
                        const configPort =
                            this.config.port != null ? await this.config.port : undefined;
                        const resolvedPort = manifestPort ?? configPort;
                        if (resolvedPort != null) {
                            const protocol = this.config.protocol || 'http';
                            baseUrl = `${protocol}://${this.config.host}:${resolvedPort}`;
                            this.config.url = baseUrl;
                        }
                    }
                    url = new URL(path, baseUrl || (this.config.url as string) || '');
                }
                this.log?.debug?.({
                    req: {
                        method: (method || 'POST').toUpperCase(),
                        url,
                        headers,
                        body,
                        json,
                    },
                });
                const kyOptions: KyOptions = {
                    method: method || 'POST',
                    headers,
                    throwHttpErrors: false,
                    redirect: 'manual',
                    ...(json != null ? {json} : {}),
                    ...(form != null ? {body: new URLSearchParams(form)} : {}),
                    ...(body != null && json == null && form == null ? {body} : {}),
                    ...(searchParams != null
                        ? {searchParams: searchParams as Record<string, string>}
                        : {}),
                };
                const res = await kyInstance(url.toString(), kyOptions);
                const resolvedBody =
                    responseType === 'buffer'
                        ? await res.arrayBuffer()
                        : responseType === 'text'
                          ? await res.text()
                          : await res.json().catch(() => null);
                const result = {
                    statusCode: res.status,
                    statusMessage: res.statusText,
                    headers: Object.fromEntries(res.headers.entries()),
                    body: resolvedBody,
                };
                this.log?.debug?.({
                    req: {
                        url,
                        method: (method || 'POST').toUpperCase(),
                    },
                    res: result,
                });
                return result;
            } catch (error) {
                throw this.error(_errors['http.generic'](error), $meta);
            }
        },
    };
});
