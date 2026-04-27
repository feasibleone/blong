import type {IMeta} from '@feasibleone/blong/types';
import {adapter, type Errors, type IErrorMap} from '@feasibleone/blong/types';
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
        /**
         * configChanged hook: only recreate TLS options when the `tls` or `url`
         * sub-key changed.  Unrelated config changes are ignored.
         */
        async configChanged(diff, next) {
            const tlsOrUrlChanged = Array.from(diff.keys()).some(
                key =>
                    key === this.config.id + '.tls' ||
                    key.startsWith(this.config.id + '.tls.') ||
                    key === this.config.id + '.url',
            );
            if (!tlsOrUrlChanged) return;
            const newAdapterConfig = (next as Record<string, unknown>)?.[this.config.id] as
                | Partial<IConfig>
                | undefined;
            if (newAdapterConfig) {
                this.config.tls = newAdapterConfig.tls ?? this.config.tls;
                this.config.url = newAdapterConfig.url ?? this.config.url;
            }
            https = tls(this.config, true);
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
