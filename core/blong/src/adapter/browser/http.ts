import got, {type HttpsOptions, type Options} from 'got';
import type {IMeta} from '../../../types.js';
import {adapter, type Errors} from '../../../types.js';
import type {IErrorMap} from '../../error.js';
import tls from '../../tls.js';

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
    // _errors ||= utError.defineError(errorMap);

    let https: HttpsOptions;
    return {
        async init(...configs: object[]) {
            await super.init({type: 'http'}, ...configs);
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
            {stream}: IMeta
        ) {
            try {
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
