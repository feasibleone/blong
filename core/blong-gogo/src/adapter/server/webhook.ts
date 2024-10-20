import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';
import got, {type HttpsOptions, type Options} from 'got';
import {Duplex, Readable, Writable} from 'stream';

import tls from '../../tls.js';

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
    let stream: Duplex = null;
    let https: HttpsOptions;

    return {
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'webhook',
                    url: 'http://localhost:8080',
                },
                ...configs
            );
            https = tls(this.config, true);
            if (this.config['codec.openapi'])
                await registry.loadApi(
                    this.config.id + '.api',
                    this.config['codec.openapi'],
                    this.configBase
                );
        },

        async start() {
            const result = await super.start();
            const readable = new Readable({
                objectMode: true,
                read() {},
            });

            local.register(
                {
                    [`${this.config.namespace}Webhook.request`]: async (
                        params: unknown,
                        $meta: IMeta
                    ) =>
                        new Promise((resolve, reject) => {
                            $meta.dispatch = function (...packet: unknown[]) {
                                this.dispatch(...packet).then(resolve, reject);
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
                this.config.pkg
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
                            IMeta
                        ],
                        encoding: Parameters<ConstructorParameters<typeof Writable>[0]['write']>[1],
                        callback: Parameters<ConstructorParameters<typeof Writable>[0]['write']>[2]
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
                            if (this.log.trace) this.log.trace(request);
                            else this.log.info?.(`${request.method.toUpperCase()} ${url}`);
                            {
                                const result = await got(request);
                                const {headers, body, statusCode, statusMessage} = result;
                                if (this.log.trace) this.log.trace({headers, body, statusCode});
                                else
                                    this.log.info?.(
                                        `${statusCode} ${statusMessage} ${request.method.toUpperCase()} ${url}`
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
