/**
 * ACL matrix fixture — service accounts.
 *
 * The same org chart as `aclMatrix.ts`, but every viewer row is a service
 * account: an `access_user` profile on the organization or unit resource itself,
 * holding one role, authenticated with the OAuth `client_credentials` grant
 * (clientId + clientSecret).  No session is created and no password is used.
 *
 * The `Background` asserts that fixture — the chart carries each account's
 * `clientId` and role, and the grants table carries the role's scope and
 * capability — so the reader sees what the cells are derived from and the seed
 * is checked to match.
 *
 * Three tables, one per guarded shape:
 *
 *   - `party.person.get`          — a record scoped at its unit (`scopes`)
 *   - `party.unit.get`            — a record scoped at its organization
 *   - `party.organization.get`    — a record that IS its own scope (`selfScope`,
 *                                   with no RBAC fallback at all)
 *
 * Cells are the same alphabet as the person matrix:
 *   allowed `✅` · denied `❌` (`acl.notFound`) · RBAC-forbidden `🚫` · n/a `·`
 *
 * A unit account also inherits the grant of the organization it belongs to
 * (`organization --hasScope--> organization` reaches every unit under it), which
 * is why `Axis`'s grant shows up on the `Axis HQ`, `North` and `South` rows —
 * the notes column says so on each row.  The RBAC-forbidden row therefore has to
 * be an account with no granted ancestor, which is `Beta`.
 *
 * Seeded by `meta/dbTest/22-aclMatrix-partyServiceAccountMerge.yaml`; asserted by
 * `browser/test/test/testAclMatrixService.ts` (group `test.acl.matrix.service`).
 */
export default `Feature: Record-level ACL matrix — service accounts

  Background:
    # Every cell below is compared with the graph; an em dash asserts "none".  A person
    # has no account of its own in this matrix, so its two columns stay empty.
    Given the ACL org chart is
      | record           | kind   | belongsTo | isPartOf | clientId   | hasRole    | notes                    |
      | Axis             | org    |           |          | axis-sa    | svcAxisOrg | an org is its own scope  |
      | ├── Axis HQ      | unit   | Axis      |          | axis-hq-sa | svcAxisHq  |                          |
      | │   ├── North    | unit   | Axis      | Axis HQ  | north-sa   | svcNorth   |                          |
      | │   │   ├── Amy  | person | North     |          |            |            |                          |
      | │   │   ├── Ben  | person | North     |          |            |            |                          |
      | │   │   └── Ivy  | person | North     |          |            |            | holds the wildcard deny  |
      | │   └── South    | unit   | Axis      | Axis HQ  | south-sa   | svcSouth   |                          |
      | │       ├── Cam  | person | South     |          |            |            |                          |
      | │       └── Fay  | person | South     |          |            |            | shares South with Cam    |
      | Beta             | org    |           |          | beta-sa    | svcNone    | no read capability       |
      | └── East         | unit   | Beta      |          | east-sa    | svcEast    | inherits nothing of Beta |
      |     ├── Dee      | person | East      |          |            |            |                          |
      |     └── Gil      | person | East      |          |            |            |                          |
      | Hal              | person |           |          |            |            | no unit: no scope at all |
    And the ACL grants are
      | principal  | kind | hasScope | hasCapability              | notes               |
      | svcAxisOrg | role | Axis     | loginCapability,matrixView |                     |
      | svcAxisHq  | role | Axis HQ  | loginCapability,matrixView |                     |
      | svcNorth   | role | North    | loginCapability,matrixView |                     |
      | svcSouth   | role | South    | loginCapability,matrixView |                     |
      | svcEast    | role | East     | loginCapability,matrixView |                     |
      | svcNone    | role | —        | loginCapability            | no read capability  |

  Scenario: The party.person.get service-account matrix
    Then the party.person.get service-account matrix is
      | viewer        | Amy | Ben | Cam | Dee | Fay | Gil | Hal | Ivy | notes                                       |
      | Axis          | ❌  | ❌  | ❌  | ❌  | ❌  | ❌  | ✅  | ❌  | grant ↦ Axis: no person scope holds an org  |
      | ├── Axis HQ   | ✅  | ✅  | ✅  | ❌  | ✅  | ❌  | ✅  | ✅  | svcAxisHq ↦ Axis HQ (inherits Axis)         |
      | │   ├── North | ✅  | ✅  | ❌  | ❌  | ❌  | ❌  | ✅  | ✅  | svcNorth ↦ North (inherits Axis)            |
      | │   └── South | ❌  | ❌  | ✅  | ❌  | ✅  | ❌  | ✅  | ❌  | svcSouth ↦ South (inherits Axis)            |
      | Beta          | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | svcNone: no party.person.get                |
      | └── East      | ❌  | ❌  | ❌  | ✅  | ❌  | ✅  | ✅  | ❌  | svcEast ↦ East                              |

  Scenario: The party.unit.get service-account matrix
    Then the party.unit.get service-account matrix is
      | viewer        | Axis HQ | North | South | East | notes                                      |
      | Axis          | ✅      | ✅    | ✅    | ❌   | grant ↦ Axis: a unit's scope               |
      | ├── Axis HQ   | ✅      | ✅    | ✅    | ❌   | grant ↦ Axis HQ + inherits Axis            |
      | │   ├── North | ✅      | ✅    | ✅    | ❌   | inherits Axis (belongsTo Axis)             |
      | │   └── South | ✅      | ✅    | ✅    | ❌   | grant ↦ South + inherits Axis              |
      | Beta          | 🚫      | 🚫    | 🚫    | 🚫   | svcNone: no party.unit.get                 |
      | └── East      | ❌      | ❌    | ❌    | ❌   | grant ↦ East names the unit, not its scope |

  Scenario: The party.organization.get service-account matrix
    Then the party.organization.get service-account matrix is
      | viewer        | Axis | Beta | notes                                  |
      | Axis          | ✅   | ❌   | grant ↦ Axis: an org is its own scope  |
      | ├── Axis HQ   | ✅   | ❌   | inherits Axis (belongsTo Axis)         |
      | │   ├── North | ✅   | ❌   | inherits Axis (belongsTo Axis)         |
      | │   └── South | ✅   | ❌   | grant ↦ South + inherits Axis          |
      | Beta          | 🚫   | 🚫   | svcNone: no party.organization.get     |
      | └── East      | ❌   | ❌   | grant ↦ East, and Beta holds no role   |
`;
