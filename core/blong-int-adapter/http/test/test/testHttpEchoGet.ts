import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {echoEchoGet}}) => ({
    testHttpEchoGet: ({name = 'http echo GET'}, $meta) =>
        group(name)([
            async function echoRequest(assert: typeof Assert, {$meta}) {
                const result = await echoEchoGet(
                    {path: '/test', method: 'GET', responseType: 'json'},
                    $meta,
                );
                assert.ok(result, 'Echo should return a response');
                assert.strictEqual(
                    (result as {body?: {echo?: boolean}}).body?.echo,
                    true,
                    'Echo response should have echo: true',
                );
                return result;
            },
        ]),
}));
