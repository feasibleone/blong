import timing from 'ut-function.timing';
import {handler, type IMeta} from '../../../../types.js';

export default handler(({config}) => {
    let id = 1;
    return {
        send(
            msg: {$http: {method?: string; headers?: unknown; path?: unknown}},
            $meta: IMeta,
            context: unknown
        ) {
            const params = (msg && !(msg instanceof Array) && Object.assign({}, msg)) || msg;
            const $http = params?.$http;
            delete params?.$http;
            const result = {
                method: $http?.method,
                headers: $http?.headers,
                path:
                    $http?.path ??
                    `/rpc/${$meta.method.replace(/\//gi, '%2F').replace(/\./g, '/')}`,
                responseType: 'json',
                // body,
                // form,
                json: {
                    jsonrpc: '2.0',
                    ...($meta.mtid === 'request' && {id: id++}),
                    method: $meta.method,
                    params,
                    expect: $meta.expect,
                    ...($meta.timeout &&
                        $meta.timeout[0] && {timeout: timing.spare($meta.timeout, config.latency)}),
                },
            };
            return super.send ? super.send(result, $meta, context) : result;
        },
    };
});
