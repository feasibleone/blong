import {handler, type IMeta} from '@feasibleone/blong/types';

/**
 * Minimal hello-world handler.
 *
 * Accessible via JSON-RPC once `blong` is run from this folder:
 *
 *   POST http://localhost:8080/rpc/hello/hello
 *   Content-Type: application/json
 *   { "jsonrpc": "2.0", "method": "hello.hello", "params": [{"name": "World"}], "id": 1 }
 */
export default handler(
    () =>
        async function helloHello({name = 'World'}: {name?: string}, $meta: IMeta) {
            return {message: `Hello, ${name}!`, auth: $meta.auth};
        },
);
