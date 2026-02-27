import type {IMeta} from '@feasibleone/blong';
import {adapter, type IApi, type Errors, type IErrorMap} from '@feasibleone/blong';
import got, {type HttpsOptions, type Options} from 'got';

import tls from '../../tls.ts';

export interface IConfig {
    tls?: {
        key?: string;
        cert?: string;
        ca?: string | string[];
    };
    url?: string;
}

const errorMap: IErrorMap = {
    'http.generic': 'HTTP Error',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}: IApi) => {
    _errors ||= utError.register(errorMap);

    let https: HttpsOptions;
    return {
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'http',
                },
                ...configs,
            );
            https = tls(this.config, true);
        },
        start() {
            super.connect();
            return super.start();
        },
        async exec(
            {
                path,
                query: searchParams,
                host,
                port,
                url = new URL(path, this.config.url || 'http://localhost'),
                responseType,
                method,
                headers,
                body,
                form,
                json,
            }: {
                path?: string;
                query?: string;
                host?: string;
                port?: number;
                url?: URL;
                responseType?: Options['responseType'];
                method?: Options['method'];
                headers?: Options['headers'];
                body?: Options['body'];
                form?: Options['form'];
                json?: Options['json'];
            },
            {stream}: IMeta,
        ) {
            try {
                if (host) url.hostname = host;
                if (port) url.port = String(port);
                return got({
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
                    isStream: !!stream,
                });
            } catch (error) {
                throw _errors['http.generic'](error);
            }
        },
    };
});
