import {test} from 'tap';

import {agentEngineKey} from './agentKey.ts';

/**
 * Where an engine account's key comes from.
 *
 * Two sources, and the order between them is the whole behaviour: a literal key wins, because a
 * checkout names one and must not depend on an environment it does not have, and a deployment names
 * a variable instead, which the cluster fills from a Secret (`@@T-578`). Neither present is no key
 * at all rather than an empty string, because the SDKs read `''` as a configured key and fail later
 * with an authentication error nobody can trace back to the configuration.
 */
test('agentEngineKey prefers the literal key an account carries', t => {
    t.equal(
        agentEngineKey({apiKey: 'literal', apiKeyEnv: 'AGENT_KEY'}, {AGENT_KEY: 'from-env'}),
        'literal',
        'the key in the config wins over the one in the environment',
    );
    t.end();
});

test('agentEngineKey reads the variable an account names', t => {
    t.equal(
        agentEngineKey({apiKeyEnv: 'AGENT_KEY'}, {AGENT_KEY: 'from-env'}),
        'from-env',
        'a deployment keeps the key in a Secret and names the variable, not the key',
    );
    t.equal(
        agentEngineKey({apiKeyEnv: 'AGENT_KEY'}, {}),
        undefined,
        'and a variable that is not set is no key rather than an empty one',
    );
    t.equal(
        agentEngineKey({}, {AGENT_KEY: 'from-env'}),
        undefined,
        'while an account that names no variable reads none of them',
    );
    t.end();
});
