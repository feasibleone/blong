import type {Errors, IErrorMap, IMeta} from '@feasibleone/blong/types';
import {adapter} from '@feasibleone/blong/types';
import ky, {type Options as KyOptions} from 'ky';

export interface IConfig {
    url?: string;
}

const errorMap: IErrorMap = {
    'http.generic': 'HTTP Error',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        activation: {
            default: {
                type: 'http',
            },
        },
        async init(...configs: object[]) {
            await super.init(...configs);
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
                this.log.debug?.({
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
                const res = await ky(url.toString(), kyOptions);
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
                this.log.debug?.({
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
