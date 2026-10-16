/**
 * The acceptance test: run 622 of `Build`, the run that started all this.
 *
 * Every other test in this module feeds the parser a fixture. This one runs the command against the
 * real run and checks the answers it must produce — three failing operations where the published
 * bundle names two, a leg-gap for `blong-log`, an expired budget for `blong-kukum`, and the
 * comparison with #621 that makes those two a slow runner rather than broken code (@@F-539).
 *
 * It is opt-in because it needs the network: the reports site for the bundle, and an authenticated
 * `gh` for the job log. Without `--full` it downloads nothing, which keeps it cheap enough to be
 * worth running whenever the report schema, the per-package page or the job log's summary changes —
 * this command parses all three.
 *
 *   BLONG_CI_ACCEPTANCE=1 blong-dev test src/ci/acceptance.test.ts
 *   BLONG_CI_ACCEPTANCE=full blong-dev test src/ci/acceptance.test.ts   # + the artifact
 */

import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'tap';

import type {IDiagnosis} from './types.ts';

const MODE = process.env['BLONG_CI_ACCEPTANCE'];
const BIN = fileURLToPath(new URL('../../bin/blong-dev.ts', import.meta.url));

/** Run the command and parse its `--json` document. */
function diagnoseRun622(full: boolean): IDiagnosis {
    const stdout = execFileSync(
        process.execPath,
        [BIN, 'ci', 'failures', '--run', '622', '--json', ...(full ? ['--full'] : [])],
        {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024},
    );
    return JSON.parse(stdout) as IDiagnosis;
}

test(
    'run 622 reports the three failing operations the bundle under-reports',
    {skip: !MODE},
    async t => {
        const diagnosis = diagnoseRun622(false);

        t.equal(diagnosis.target.run, 622, 'the run asked for');
        t.same(
            diagnosis.operations
                .filter(operation => operation.verdict === 'failure')
                .map(operation => operation.package)
                .sort(),
            ['blong-cli', 'blong-kukum', 'blong-log'],
            'every failing operation, from the job log',
        );
        t.equal(
            diagnosis.packages.find(pkg => pkg.package === 'blong-log')?.legGap,
            true,
            'blong-log is the leg the bundle never heard about',
        );
        const kukum = diagnosis.packages.find(pkg => pkg.package === 'blong-kukum');
        t.equal(
            kukum?.failures[0]?.verdict?.kind,
            'timeout-under-load',
            'the expiry is named as such',
        );
        t.match(
            kukum?.previous && `#${kukum.previous.run}`,
            /#621/,
            'compared with the run before it',
        );
        t.end();
    },
);

test(
    'with the artifact, every failure of run 622 gets its reason',
    {skip: MODE !== 'full'},
    async t => {
        const diagnosis = diagnoseRun622(true);

        t.equal(diagnosis.evidence, 'artifact', 'the reasons come from the artifact');
        const cli = diagnosis.packages.find(pkg => pkg.package === 'blong-cli');
        t.match(
            cli?.failures[0]?.evidence,
            /expired: index\.test\.ts/,
            'the file budget that expired',
        );
        t.equal(
            cli?.failures[0]?.verdict?.kind,
            'timeout-under-load',
            'and the verdict it supports',
        );
        const log = diagnosis.packages.find(pkg => pkg.package === 'blong-log');
        t.match(
            log?.failures[0]?.test,
            /FilteredServer › smoke-test/,
            'the snapshot that differed',
        );
        t.match(log?.failures[0]?.evidence, /differing pixels/, 'with the diff the log reported');
        t.end();
    },
);
