import {readStream, streamSalt} from '@feasibleone/blong-mle';
import {handler, type IMeta, type IProgressEntry, type ITypedError} from '@feasibleone/blong/types';
import {type Response} from 'got';

/** Whether this response is a stream rather than one JSON body. */
function isStreamBody(body: unknown): body is ReadableStream<Uint8Array> {
    return (
        typeof body === 'object' &&
        body !== null &&
        typeof (body as ReadableStream<Uint8Array>).getReader === 'function'
    );
}

export default handler(({errors}) => ({
    async receive(
        response: Response<{
            jsonrpc?: string;
            error?: unknown;
            validation?: unknown;
            debug?: unknown;
            progress?: unknown[];
        }>,
        $meta?: IMeta,
    ) {
        // A streamed answer is not a body to parse: a plain one is read here into
        // the values the producer yielded, and a sealed one is handed outward
        // because the key agreement needs the caller's private encrypt key, which
        // only the codec above this one holds (`@@D-949`).
        if (isStreamBody(response.body)) {
            const streamed = {
                headers: response.headers,
                body: response.body as unknown as ReadableStream<Uint8Array>,
            };
            if (streamSalt(streamed)) return {stream: response};
            return readStream(streamed);
        }
        const {body} = super.receive ? await super.receive(response) : response;
        if (body?.error !== undefined) {
            const error: ITypedError = body.jsonrpc
                ? Object.assign(new Error(), body.error)
                : typeof body.error === 'string'
                  ? new Error(body.error)
                  : Object.assign(new Error(), body.error);
            if (error.type)
                Object.defineProperty(error, 'name', {
                    value: error.type,
                    configurable: true,
                    enumerable: false,
                });
            error.req = response.request && {
                httpVersion: response.httpVersion,
                url: response.request.requestUrl as URL,
                method: response.request.options.method,
                // ...config.debug && this.sanitize(params, $meta)
            };
            error.res = {
                httpVersion: response.httpVersion,
                statusCode: response.statusCode,
            };
            throw error;
        } else if (response.statusCode < 200 || response.statusCode >= 300) {
            throw errors.jsonrpcHttp({
                statusCode: response.statusCode,
                // statusText: response.statusText,
                statusMessage: response.statusMessage,
                httpVersion: response.httpVersion,
                validation: response.body?.validation,
                debug: response.body?.debug,
                body: response.body,
                params: {
                    code: response.statusCode,
                },
                ...(response.request && {
                    url: response.request.requestUrl,
                    method: response.request.options.method,
                }),
            });
        } else if (typeof body === 'object' && 'result' in body && !('error' in body)) {
            if ($meta && body.progress?.length) {
                ($meta.progress ??= []).push(...(body.progress as IProgressEntry[]));
            }
            return body.result;
        } else {
            throw errors.jsonrpcEmpty();
        }
    },
}));
