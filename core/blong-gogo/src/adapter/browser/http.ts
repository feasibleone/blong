import type {Errors, IErrorMap, IMeta} from '@feasibleone/blong';
import {adapter} from '@feasibleone/blong';
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

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    let https: HttpsOptions;
    return {
        activation: {
            default: {
                type: 'http',
            },
        },
        async init(...configs: object[]) {
            await super.init(...configs);
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
                url = new URL(path, this.config.url),
                responseType,
                method,
                headers,
                body,
                form,
                json,
            }: {
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
            {stream}: IMeta,
        ) {
            try {
                this.log.debug?.({
                    req: {
                        method: method.toUpperCase(),
                        url,
                        headers,
                        body,
                        json,
                    },
                });
                const result = (await got({
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
                })) as {
                    statusCode: number;
                    statusMessage: string;
                    headers: Record<string, unknown>;
                    body: unknown;
                };
                this.log.debug?.({
                    req: {
                        url,
                        method: method.toUpperCase(),
                    },
                    res: {
                        statusCode: result.statusCode,
                        statusMessage: result.statusMessage,
                        headers: result.headers,
                        body: result.body,
                    },
                });
                return result;
            } catch (error) {
                throw _errors['http.generic'](error);
            }
        },
    };
});
