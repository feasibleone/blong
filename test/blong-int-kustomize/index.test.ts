/**
 * index.test.ts — the tap entry: loads the suite and runs the groups on the server platform.
 *
 * The subject of these groups is a *cluster*, not this process, so nothing here starts a browser
 * platform: a run without `BLONG_TEST_CLUSTER=1` skips every step that would read one, and what is
 * left is the rules the runbook decides by (`test.script.rules`), which need no cluster at all.
 */
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];

const platform = await load(serverSuite, 'blong-int-kustomize', 'blong-int-kustomize', intents);
await platform.start({});
await tap.test('kustomize runbook (server)', async test => {
    await platform.test(test);
});
await platform.stop();
