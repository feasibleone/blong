import type {Errors, IErrorMap, IMeta} from '@feasibleone/blong/types';
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
}

const errorMap: IErrorMap = {
    'http.generic': 'HTTP Error',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
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
            if (this.config.tls) {
                // Dynamic imports — only run on the server; @vite-ignore prevents
                // Vite from trying to bundle these Node.js-only modules for the browser.
                const [{Agent}, {readFileSync}] = await Promise.all([
                    import(/* @vite-ignore */ 'undici') as Promise<typeof import('undici')>,
                    import(/* @vite-ignore */ 'node:fs') as Promise<typeof import('node:fs')>,
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
            this: import('@feasibleone/blong/types').Adapter<IConfig>,
            {
                path,
                query: searchParams,
                url = new URL(path, this.config.url),
                responseType,
                method,
                headers,
                body,
                form,
                json,
            }: {
                path: string;
                query: string | Record<string, string>;
                url: URL;
                responseType: 'json' | 'text' | 'buffer';
                method: string;
                headers: Record<string, string>;
                body: BodyInit;
                form: Record<string, string>;
                json: unknown;
            },
            _meta: IMeta,
        ) {
            try {
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
                    ...(searchParams != null ? {searchParams: searchParams as Record<string, string>} : {}),
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
                throw _errors['http.generic'](error);
            }
        },
    };
});
