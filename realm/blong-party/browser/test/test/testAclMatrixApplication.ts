import {handler} from '@feasibleone/blong';
import {featureToSteps} from '@feasibleone/blong-cucumber';

import aclMatrixApplicationFeature from '../feature/aclMatrixApplication.ts';
import {
    ACL_TARGET_ORGANIZATIONS,
    ACL_TARGET_PERSONS,
    ACL_TARGET_UNITS,
    type IAclMatrixPrincipal,
} from './aclMatrix.ts';

/**
 * Browser-side (HTTP) gateway-application ACL matrix — group
 * `test.acl.matrix.application`.
 *
 * Rows are OAuth applications; each signs in with the `client_credentials` grant
 * (clientId + the secret its fixture pinned) and its authorization comes from the
 * bundle it is subscribed to.  Every probe runs through the real gateway, so RBAC
 * (403) and the record-level ACL (404) both decide a cell.  The Background
 * asserts the fixture: the chart, the bundles each application is subscribed to,
 * and the bundles' own grants and rules.
 */
const SECRET = 'testAppSecret';

/** The fixture's applications — seeded by `24-aclMatrix-gatewayApplicationMerge.yaml`. */
const PRINCIPALS: Record<string, IAclMatrixPrincipal> = {
    'axis-app': {clientId: 'axis-app', secret: SECRET},
    'axis-hq-app': {clientId: 'axis-hq-app', secret: SECRET},
    'north-app': {clientId: 'north-app', secret: SECRET},
    'south-app': {clientId: 'south-app', secret: SECRET},
    'beta-app': {clientId: 'beta-app', secret: SECRET},
    'east-app': {clientId: 'east-app', secret: SECRET},
    'any-app': {clientId: 'any-app', secret: SECRET},
    'none-app': {clientId: 'none-app', secret: SECRET},
};

export default handler(({lib: {group, aclFixture, aclMatrix, aclFixtureStep, aclMatrixStep}}) => ({
    testAclMatrixApplication: ({name = 'acl matrix application'}: {name?: string} = {}) =>
        featureToSteps(
            aclMatrixApplicationFeature,
            {
                'the ACL org chart is': aclFixtureStep(aclFixture, 'the ACL org chart'),
                'the ACL applications are': aclFixtureStep(aclFixture, 'the ACL applications'),
                'the ACL bundles are': aclFixtureStep(aclFixture, 'the ACL bundles'),
                'the ACL rules are': aclFixtureStep(aclFixture, 'the ACL rules'),
                'the party.person.get application matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_PERSONS,
                    'party.person.get',
                    PRINCIPALS,
                ),
                'the party.unit.get application matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_UNITS,
                    'party.unit.get',
                    PRINCIPALS,
                ),
                'the party.organization.get application matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_ORGANIZATIONS,
                    'party.organization.get',
                    PRINCIPALS,
                ),
            },
            {name, group},
        ),
}));
