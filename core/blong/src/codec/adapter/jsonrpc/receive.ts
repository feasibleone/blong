import { type Response } from 'got';

import { handler } from '../../../../types.js';

interface HTTPError extends Error {
    type?: string;
    req?: object;
    res?: object;
}

export default handler(({
    lib: {
        errors
    }
}) => ({
    async receive(response: Response<{jsonrpc?: string, error?: unknown, validation?: unknown, debug?: unknown}>, $meta) {
        const {body} = super.receive ? await super.receive(response) : response;
        if (body?.error !== undefined) {
            const error: HTTPError =
                            body.jsonrpc
                                ? Object.assign(new Error(), body.error)
                                : typeof body.error === 'string'
                                    ? new Error(body.error)
                                    : Object.assign(new Error(), body.error);
            if (error.type) Object.defineProperty(error, 'name', {value: error.type, configurable: true, enumerable: false});
            error.req = response.request && {
                httpVersion: response.httpVersion,
                url: response.request.requestUrl,
                method: response.request.options.method
                // ...config.debug && this.sanitize(params, $meta)
            };
            error.res = {
                httpVersion: response.httpVersion,
                statusCode: response.statusCode
            };
            throw error;
        } else if (response.statusCode < 200 || response.statusCode >= 300) {
            throw errors['jsonrpc.http']({
                statusCode: response.statusCode,
                // statusText: response.statusText,
                statusMessage: response.statusMessage,
                httpVersion: response.httpVersion,
                validation: response.body?.validation,
                debug: response.body?.debug,
                body: response.body,
                params: {
                    code: response.statusCode
                },
                ...response.request && {
                    url: response.request.requestUrl,
                    method: response.request.options.method
                }
            });
        } else if (typeof body === 'object' && 'result' in body && !('error' in body)) {
            return body.result;
        } else {
            throw errors['jsonrpc.empty']();
        }
    }
}));
