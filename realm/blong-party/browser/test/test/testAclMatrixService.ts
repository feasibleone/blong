import {handler} from '@feasibleone/blong';
import {featureToSteps} from '@feasibleone/blong-cucumber';

import aclMatrixServiceFeature from '../feature/aclMatrixService.ts';
import {
    ACL_TARGET_ORGANIZATIONS,
    ACL_TARGET_PERSONS,
    ACL_TARGET_UNITS,
    type IAclMatrixPrincipal,
} from './aclMatrix.ts';

/**
 * Browser-side (HTTP) service-account ACL matrix — group `test.acl.matrix.service`.
 *
 * Same helper as the person matrix, with two differences: each row signs in with
 * the OAuth `client_credentials` grant (clientId + clientSecret, no session) and
 * the three scenarios probe three different guarded tables.  Every probe runs
 * through the real gateway, so RBAC (403) and the record-level ACL (404) both
 * decide a cell.  The Background asserts the fixture — including the account
 * `clientId` each organization and unit presents.
 */
const SECRET = 'testClientSecret';

/** The fixture's service accounts — seeded by `22-aclMatrix-partyServiceAccountMerge.yaml`. */
const PRINCIPALS: Record<string, IAclMatrixPrincipal> = {
    Axis: {clientId: 'axis-sa', secret: SECRET},
    'Axis HQ': {clientId: 'axis-hq-sa', secret: SECRET},
    North: {clientId: 'north-sa', secret: SECRET},
    South: {clientId: 'south-sa', secret: SECRET},
    Beta: {clientId: 'beta-sa', secret: SECRET},
    East: {clientId: 'east-sa', secret: SECRET},
};

export default handler(({lib: {group, aclFixture, aclMatrix, aclFixtureStep, aclMatrixStep}}) => ({
    testAclMatrixService: ({name = 'acl matrix service'}: {name?: string} = {}) =>
        featureToSteps(
            aclMatrixServiceFeature,
            {
                'the ACL org chart is': aclFixtureStep(aclFixture, 'the ACL org chart'),
                'the ACL grants are': aclFixtureStep(aclFixture, 'the ACL grants'),
                'the ACL rules are': aclFixtureStep(aclFixture, 'the ACL rules'),
                'the party.person.get service-account matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_PERSONS,
                    'party.person.get',
                    PRINCIPALS,
                ),
                'the party.unit.get service-account matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_UNITS,
                    'party.unit.get',
                    PRINCIPALS,
                ),
                'the party.organization.get service-account matrix is': aclMatrixStep(
                    aclMatrix,
                    ACL_TARGET_ORGANIZATIONS,
                    'party.organization.get',
                    PRINCIPALS,
                ),
            },
            {name, group},
        ),
}));
