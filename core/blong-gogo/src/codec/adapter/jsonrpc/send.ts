import {STREAM_BINARY_TYPE, STREAM_TEXT_TYPE} from '@feasibleone/blong-mle';
import {handler, type IMeta} from '@feasibleone/blong/types';

export default handler(({config, lib: {timing}}) => {
    let id = 1;
    return {
        send(
            msg: {$http?: {method?: string; headers?: unknown; path?: unknown}},
            $meta: IMeta,
            context: unknown,
        ) {
            const params = (msg && !(msg instanceof Array) && Object.assign({}, msg)) || msg;
            const $http = params?.$http;
            delete params?.$http;
            // A stream is asked for by the caller and answered by the envelope it
            // names: the readable one unless the call said `binary` (`@@D-949`).
            const stream = ($meta as {stream?: boolean | string}).stream;
            const result = {
                method: $http?.method,
                headers: stream
                    ? {
                          ...($http?.headers as Record<string, string> | undefined),
                          accept: stream === 'binary' ? STREAM_BINARY_TYPE : STREAM_TEXT_TYPE,
                      }
                    : $http?.headers,
                path:
                    $http?.path ??
                    `/rpc/${$meta.method!.replace(/\//gi, '%2F').replace(/\./g, '/')}`,
                responseType: stream ? 'stream' : 'json',
                // body,
                // form,
                json: {
                    jsonrpc: '2.0',
                    ...($meta.mtid === 'request' && {id: id++}),
                    method: $meta.method,
                    params,
                    expect: $meta.expect,
                    ...($meta.timeout &&
                        $meta.timeout[0] && {timeout: timing.spare($meta.timeout, config.latency as number | undefined)}),
                },
            };
            return super.send ? super.send(result, $meta, context) : result;
        },
    };
});
