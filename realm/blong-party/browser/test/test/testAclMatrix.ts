import {handler} from '@feasibleone/blong';
import {featureToSteps} from '@feasibleone/blong-cucumber';

import aclMatrixFeature from '../feature/aclMatrix.ts';
import {ACL_TARGET_CONSENTS, ACL_TARGET_PERSONS, ACL_TARGET_RULES} from './aclMatrix.ts';

/**
 * Browser-side (HTTP) ACL matrix flow — group `test.acl.matrix`.
 *
 * The feature file is the matrix: its Background asserts the fixture the matrix
 * is built from (the chart, the users, the grants and the rules), and its
 * scenarios are the outcome tables — the guarded reads of `party.person`, then
 * the same rules read back from the unguarded `access.acl`.  The steps come from
 * the shared factories (see `aclSteps.ts`) — the matrix probes through the real
 * gateway (see the `aclMatrix` library for why the probe cannot run in-process)
 * and asserts once, printing the redrawn tables on failure.
 */
export default handler(({lib: {group, aclFixture, aclMatrix, aclFixtureStep, aclMatrixStep}}) => ({
    testAclMatrix: ({name = 'acl matrix'}: {name?: string} = {}) =>
        featureToSteps(
            aclMatrixFeature,
            {
                'the ACL org chart is': aclFixtureStep(aclFixture, 'the ACL org chart'),
                'the ACL users are': aclFixtureStep(aclFixture, 'the ACL users'),
                'the ACL grants are': aclFixtureStep(aclFixture, 'the ACL grants'),
                'the ACL rules are': aclFixtureStep(aclFixture, 'the ACL rules'),
                'the ACL consents are': aclFixtureStep(aclFixture, 'the ACL consents'),
                'the party.person.get access matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_PERSONS,
                    'party.person.get',
                ),
                'the party.consent.get access matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_CONSENTS,
                    'party.consent.get',
                ),
                'the access.acl.get access matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_RULES,
                    'access.acl.get',
                ),
            },
            {name, group},
        ),
}));
