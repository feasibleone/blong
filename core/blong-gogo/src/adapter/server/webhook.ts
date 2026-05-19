import {
    adapter,
    type Adapter,
    type Errors,
    type IErrorMap,
    type IMeta,
} from '@feasibleone/blong/types';
import got, {type HttpsOptions, type Options} from 'got';
import {Duplex, Readable, Writable} from 'stream';

import tls from '../../tls.ts';

export interface IConfig {
    tls?: {
        key?: string;
        cert?: string;
        ca?: string | string[];
    };
    handle?: string;
    url?: string;
}

const errorMap: IErrorMap = {
    'webhook.http': 'HTTP Error',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError, local, registry}) => {
    _errors ||= utError.register(errorMap);
    let stream: Duplex | null = null;
    let https: HttpsOptions | undefined;

    return {
        activation: {
            default: {
                type: 'webhook',
                url: 'http://localhost:8080',
            },
        },
        async init(...configs: object[]) {
            await super.init(...configs);
            https = tls(this.config, true) as HttpsOptions | undefined;
            const cfg = this.config as unknown as Record<string, unknown>;
            if (cfg['codec.openapi'])
                await registry.loadApi(
                    this.config.id + '.api',
                    cfg['codec.openapi'] as {namespace: Record<string, string | string[]>},
                    this.configBase ?? '',
                );
        },

        async start(this: Adapter<IConfig>) {
            const result = await super.start();
            const readable = new Readable({
                objectMode: true,
                read() {},
            });
            local.register(
                {
                    [`${this.config.namespace}Webhook.request`]: async (
                        params: unknown,
                        $meta: unknown,
                    ) =>
                        new Promise((resolve, reject) => {
                            ($meta as Record<string, unknown>)['dispatch'] = (
                                ...packet: unknown[]
                            ) => {
                                (this.dispatch as (...args: unknown[]) => Promise<unknown[]>)(
                                    ...packet,
                                ).then(resolve, reject);
                            };
                            readable.push([params, $meta]);
                        }),
                    [`${this.config.namespace}Webhook.publish`]: async (...params: unknown[]) => {
                        // console.log('publish', params);
                        readable.push(params);
                    },
                },
                'ports',
                false,
                this.config.pkg,
            );

            stream = Duplex.from({
                writable: new Writable({
                    objectMode: true,
                    write: async (
                        [
                            {
                                path = '',
                                query: searchParams,
                                url = new URL(path, this.config.url),
                                responseType = 'json',
                                method,
                                headers,
                                body,
                                form,
                                json,
                            },
                            $meta,
                        ]: [
                            {
                                path: string;
                                query: string;
                                url: URL;
                                responseType: Options['responseType'];
                                method: Options['method'];
                                headers: Options['headers'];
                                body: Options['body'];
                                form: Options['form'];
                                json: Options['json'];
                            },
                            IMeta,
                        ],
                        _encoding: BufferEncoding,
                        callback: (error?: Error | null) => void,
                    ) => {
                        try {
                            const request = {
                                url,
                                searchParams,
                                https,
                                method: method || 'POST',
                                headers,
                                responseType,
                                body,
                                form,
                                json,
                                throwHttpErrors: false,
                                followRedirect: false,
                                // isStream: false,
                            };
                            if (this.log?.trace) this.log.trace(request);
                            else
                                this.log?.info?.(
                                    `${(request.method as string).toUpperCase()} ${url}`,
                                );
                            {
                                const result = await got(request);
                                const {headers, body, statusCode, statusMessage} = result;
                                if (this.log?.trace) this.log.trace({headers, body, statusCode});
                                else
                                    this.log?.info?.(
                                        `${statusCode} ${statusMessage} ${(request.method as string).toUpperCase()} ${url}`,
                                    );
                                if (!$meta.trace)
                                    readable.push([result, {...$meta, mtid: 'response'}]);
                            }
                        } catch (error) {
                            callback(_errors['webhook.http'](error));
                            return;
                        }
                        callback();
                    },
                }),
                readable,
            });

            super.connect(stream);

            return result;
        },

        async stop(...params: unknown[]) {
            let result;
            try {
                stream?.destroy();
            } finally {
                stream = null;
                result = await super.stop(...params);
            }
            return result;
        },
    };
});
