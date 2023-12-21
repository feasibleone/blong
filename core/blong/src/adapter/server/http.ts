import got, { type HTTPSOptions } from 'got';
import { adapter, type errors } from '../../../types.js';
import tls from '../../tls.js';

export type config = {
    tls?: {
        keyPath: string
        certPath: string
        caPaths: string[]
    }
    url?: string
}

const errorMap = {
    'http.generic': 'HTTP Error'
};

let _errors: errors<typeof errorMap>;

export default adapter<config>(({
    utError
}) => {
    // _errors ||= utError.defineError(errorMap);

    let https: HTTPSOptions;
    return {
        async init(...configs) {
            await super.init({
                type: 'http'
            }, ...configs);
            https = tls(this.config, true);
        },
        start() {
            super.connect();
            return super.start();
        },
        async exec({
            path,
            query: searchParams,
            url = new URL(path, this.config.url),
            responseType,
            method,
            headers,
            body,
            form,
            json
        }, {stream, ...$meta}) {
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
                    isStream: !!stream
                });
            } catch (error) {
                throw _errors['http.generic'](error);
            }
        }
    };
});
