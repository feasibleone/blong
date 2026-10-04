/**
 * ACL matrix fixture — gateway applications.
 *
 * The same Axis/Beta org chart and the same three guarded shapes, but the rows
 * are OAuth applications subscribed to API bundles.  A bundle IS an
 * `access.role`, so an application's access is its bundle's scope — the same
 * narrowing a user's role gets.  Applications authenticate exactly like the
 * service accounts (`client_credentials`, clientId + clientSecret), so no
 * session is created.
 *
 * The `Background` asserts that fixture.  An application is not part of the
 * chart, so it gets its own table, and the table is what makes the contrast
 * visible: an application holds nothing but the bundle it is subscribed to.
 *
 * The contrast with the service-account matrix is the point: an application is
 * NOT in the org chart, so it inherits nothing.  Where a unit account picks up
 * the grant of the organization it belongs to, `north-app` sees only North —
 * and, since a unit's scope set is the organization it belongs to, a unit-scoped
 * bundle cannot read the unit record it is named after.
 *
 * Cells are the same alphabet: ✅ allowed · ❌ denied (`acl.notFound`) ·
 * 🚫 RBAC-forbidden · · not applicable.
 *
 * Seeded by `meta/dbTest/23-…gatewayBundleMerge.yaml`,
 * `24-…gatewayApplicationMerge.yaml`, `25-…gatewaySubscriptionMerge.yaml` and
 * `26-…accessAuthorizationMerge.yaml`; asserted by
 * `browser/test/test/testAclMatrixApplication.ts`
 * (group `test.acl.matrix.application`).
 */
export default `Feature: Record-level ACL matrix — gateway applications

  Background:
    # Every cell below is compared with the graph; an em dash asserts "none".  An
    # application's clientId IS its record name (there is no profile row), which
    # is why it needs no column of its own.
    Given the ACL org chart is
      | record           | kind   | belongsTo | isPartOf | notes                       |
      | Axis             | org    |           |          | the granted organization    |
      | ├── Axis HQ      | unit   | Axis      |          | North and South are inside  |
      | │   ├── North    | unit   | Axis      | Axis HQ  | a grant covers its branches |
      | │   │   ├── Amy  | person | North     |          |                             |
      | │   │   ├── Ben  | person | North     |          |                             |
      | │   │   └── Ivy  | person | North     |          | holds the wildcard deny     |
      | │   └── South    | unit   | Axis      | Axis HQ  |                             |
      | │       ├── Cam  | person | South     |          |                             |
      | │       └── Fay  | person | South     |          |                             |
      | Beta             | org    |           |          | the out-of-scope side       |
      | └── East         | unit   | Beta      |          | one unit, no parent unit    |
      |     ├── Dee      | person | East      |          |                             |
      |     └── Gil      | person | East      |          |                             |
      | Hal              | person |           |          | no unit: no scope at all    |
    And the ACL applications are
      | record   | kind | hasRole         | notes                                    |
      | axis-app | app  | bundleAxisOrg   | clientId = the record name               |
      | axis-hq-app | app | bundleAxisHq  |                                          |
      | north-app   | app | bundleNorth   |                                          |
      | south-app   | app | bundleSouth   |                                          |
      | beta-app    | app | bundleBetaOrg |                                          |
      | east-app    | app | bundleEast    |                                          |
      | any-app     | app | bundleAll     |                                          |
      | none-app    | app | —             | no subscription: RBAC refuses every read |
    And the ACL bundles are
      | principal     | kind   | hasScope | hasCapability     | notes           |
      | bundleAxisOrg | bundle | Axis     | gatewayMatrixRead |                 |
      | bundleAxisHq  | bundle | Axis HQ  | gatewayMatrixRead |                 |
      | bundleNorth   | bundle | North    | gatewayMatrixRead |                 |
      | bundleSouth   | bundle | South    | gatewayMatrixRead |                 |
      | bundleBetaOrg | bundle | Beta     | gatewayMatrixRead |                 |
      | bundleEast    | bundle | East     | gatewayMatrixRead |                 |
      | bundleAll     | bundle | —        | gatewayMatrixRead | no scope at all |
    And the ACL rules are
      | principal    | kind   | effect | actions           | target | notes                 |
      | bundleAxisHq | bundle | deny   | party.person.get  | Ben    | takes one record back |
      | bundleAll    | bundle | allow  | gatewayMatrixRead | *      | every read it holds   |

  Scenario: The party.person.get application matrix
    Then the party.person.get application matrix is
      | viewer      | Amy | Ben | Cam | Dee | Fay | Gil | Hal | Ivy | notes                                          |
      | axis-app    | ❌  | ❌  | ❌  | ❌  | ❌  | ❌  | ✅  | ❌  | bundleAxisOrg ↦ Axis: no person scope holds it |
      | axis-hq-app | ✅  | ❌  | ✅  | ❌  | ✅  | ❌  | ✅  | ✅  | bundleAxisHq ↦ Axis HQ; Ben denied             |
      | north-app   | ✅  | ✅  | ❌  | ❌  | ❌  | ❌  | ✅  | ✅  | bundleNorth ↦ North                            |
      | south-app   | ❌  | ❌  | ✅  | ❌  | ✅  | ❌  | ✅  | ❌  | bundleSouth ↦ South                            |
      | beta-app    | ❌  | ❌  | ❌  | ❌  | ❌  | ❌  | ✅  | ❌  | bundleBetaOrg ↦ Beta                           |
      | east-app    | ❌  | ❌  | ❌  | ✅  | ❌  | ✅  | ✅  | ❌  | bundleEast ↦ East                              |
      | any-app     | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | bundleAll: allow rule on every record          |
      | none-app    | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | no subscription: no capabilities               |

  Scenario: The party.unit.get application matrix
    Then the party.unit.get application matrix is
      | viewer      | Axis HQ | North | South | East | notes                                    |
      | axis-app    | ✅      | ✅    | ✅    | ❌   | bundleAxisOrg ↦ Axis: a unit's scope set |
      | axis-hq-app | ❌      | ❌    | ❌    | ❌   | bundleAxisHq covers persons, not units   |
      | north-app   | ❌      | ❌    | ❌    | ❌   | bundleNorth is not a unit's scope set    |
      | south-app   | ❌      | ❌    | ❌    | ❌   | bundleSouth is not a unit's scope set    |
      | beta-app    | ❌      | ❌    | ❌    | ✅   | bundleBetaOrg ↦ Beta                     |
      | east-app    | ❌      | ❌    | ❌    | ❌   | East's own scope set is Beta             |
      | any-app     | ✅      | ✅    | ✅    | ✅   | bundleAll: allow rule on every record    |
      | none-app    | 🚫      | 🚫    | 🚫    | 🚫   | no subscription: no capabilities         |

  Scenario: The party.organization.get application matrix
    Then the party.organization.get application matrix is
      | viewer      | Axis | Beta | notes                                     |
      | axis-app    | ✅   | ❌   | bundleAxisOrg ↦ Axis: an org is its scope |
      | axis-hq-app | ❌   | ❌   | bundleAxisHq names no organization        |
      | north-app   | ❌   | ❌   | bundleNorth names no organization         |
      | south-app   | ❌   | ❌   | bundleSouth names no organization         |
      | beta-app    | ❌   | ✅   | bundleBetaOrg ↦ Beta                      |
      | east-app    | ❌   | ❌   | bundleEast names no organization          |
      | any-app     | ✅   | ✅   | bundleAll: allow rule on every record     |
      | none-app    | 🚫   | 🚫   | no subscription: no capabilities          |
`;
