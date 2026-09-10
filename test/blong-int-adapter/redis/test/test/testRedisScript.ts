import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

import {echoScript, KEY_PREFIX} from '../fixtures/keys.ts';

type StepMeta = {$meta: Record<string, unknown>};

/**
 * testRedisScript — integration test covering the generic Lua-script
 * vocabulary of `adapter.redis`: `redis.script.eval`.
 */
export default handler(
    ({lib: {group}, handler: {redisScriptEval}}) => ({
        testRedisScript: ({name = 'redis script vocabulary'}: {name?: string}) =>
            group(name)([
                async function evalScript(assert: typeof Assert, {$meta}: StepMeta) {
                    const key = `${KEY_PREFIX}:script`;
                    const result = await redisScriptEval<{result?: string}>(
                        {script: echoScript, keyNames: [key], args: ['hello-script']},
                        $meta,
                    );
                    assert.strictEqual(result.result, 'hello-script', 'eval should return the script result');
                    return result;
                },
                async function evalNoKeys(assert: typeof Assert, {$meta}: StepMeta) {
                    // A script that needs no keys: return a constant.
                    const result = await redisScriptEval<{result?: number}>(
                        {script: 'return 42', keyNames: [], args: []},
                        $meta,
                    );
                    assert.strictEqual(result.result, 42, 'eval without keys should work');
                    return result;
                },
            ]),
    }),
);
