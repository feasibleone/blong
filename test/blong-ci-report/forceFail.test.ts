/**
 * Opt-in failing test used to exercise the failure half of the CI pipeline
 * locally:
 *
 *   CI_REPORT_FORCE_FAIL=1 npm run ci-test && npm run ci-report
 *
 * It passes in normal runs, so CI stays green.
 */

import {test} from 'tap';

test('deliberate failure for the CI report harness', async t => {
    if (process.env['CI_REPORT_FORCE_FAIL'] === '1') {
        t.equal(
            'the forced failure',
            'reported end to end',
            'CI_REPORT_FORCE_FAIL=1: this failure should reach .ci-report/, ci-report.md and the failures bundle',
        );
    } else {
        t.pass('set CI_REPORT_FORCE_FAIL=1 to make this test fail on purpose');
    }
    t.end();
});
