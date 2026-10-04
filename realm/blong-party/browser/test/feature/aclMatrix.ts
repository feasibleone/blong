/**
 * ACL matrix fixture — the feature file IS the matrix.
 *
 * The `Background` asserts the fixture the matrix is built from: the org chart
 * (every node with the edge that attaches it), the users, the grants and the
 * rules.  `party.fixture.get` reads those back from the graph, so the tables
 * are a claim about the seed rather than a comment — a seed that stops matching
 * them fails the scenario before the matrix is probed.
 *
 * Column 1 of the matrix is the same org chart (box-drawing tree, leaf rows are
 * the persons).  The header cells are the subject persons of a `party.person.get`
 * probe; each cell is the verdict that person's row produces:
 *
 *   - allowed            `party.person.get` returns the record
 *   - denied             the record-level ACL hides it (`acl.notFound`, 404)
 *   - forbidden          RBAC refuses the action at the gateway (403)
 *   - not applicable     `·` — a structural row (organization / unit), not a viewer
 *
 * A user is named after its person in lower case (`Amy` the person, `amy` the
 * user) — two records, and the case is what tells them apart.  The columns are
 * the records the probe reads and the rows are the viewers, so a person with no
 * user of its own (`Hal`, who is in no unit) is a column and no row: the matrix
 * reads his record for everyone, and no one signs in as him.
 *
 * Seeded by `meta/dbTest/20-aclMatrix-partyHierarchyMerge.yaml` and
 * `meta/dbTest/21-aclMatrix-accessAuthorizationMerge.yaml`; asserted by
 * `browser/test/test/testAclMatrix.ts` (group `test.acl.matrix`).
 */
export default `Feature: Record-level ACL matrix — party.person.get

  Background:
    # Every cell below is compared with the graph; an em dash asserts "none".
    Given the ACL org chart is
      | record           | kind   | belongsTo | isPartOf | notes                            |
      | Axis             | org    |           |          | the granted organization         |
      | ├── Axis HQ      | unit   | Axis      |          | North and South are isPartOf it  |
      | │   ├── North    | unit   | Axis      | Axis HQ  | a grant on it covers both        |
      | │   │   ├── Amy  | person | North     |          |                                  |
      | │   │   ├── Ben  | person | North     |          |                                  |
      | │   │   └── Ivy  | person | North     |          | holds the wildcard deny          |
      | │   └── South    | unit   | Axis      | Axis HQ  |                                  |
      | │       ├── Cam  | person | South     |          |                                  |
      | │       └── Fay  | person | South     |          | shares South with Cam on purpose |
      | Beta             | org    |           |          | the out-of-scope organization    |
      | └── East         | unit   | Beta      |          | one unit, no parent unit         |
      |     ├── Dee      | person | East      |          |                                  |
      |     └── Gil      | person | East      |          |                                  |
      | Hal              | person |           |          | no unit: no scope at all         |
    And the ACL users are
      | record | kind | hasRole       | notes                                 |
      | amy    | user | matrixNorth   | Amy is the person, amy the user       |
      | ben    | user | matrixNorth   |                                       |
      | cam    | user | matrixAxis    |                                       |
      | ivy    | user | matrixDenyAll | the deny-all viewer                   |
      | dee    | user | matrixEast    |                                       |
      | fay    | user | matrixNone    | login only: every read is refused     |
      | gil    | user | matrixAll     |                                       |
    And the ACL grants are
      | principal     | kind | hasScope | hasCapability              | notes                  |
      | matrixNorth   | role | North    | loginCapability,matrixView |                        |
      | matrixAxis    | role | Axis HQ  | loginCapability,matrixView |                        |
      | matrixEast    | role | East     | loginCapability,matrixView |                        |
      | matrixAll     | role | —        | loginCapability,matrixView | no scope at all        |
      | matrixDenyAll | role | Axis HQ  | loginCapability,matrixView | a deny on every record |
      | matrixNone    | role | —        | loginCapability            | no read capability     |
    And the ACL rules are
      | principal     | kind | effect | actions                               | target        | notes                      |
      | matrixAxis    | role | deny   | party.person.get                      | Ben           | takes one record back      |
      | matrixNorth   | role | deny   | party.person.get                      | Hal           | ignored: Hal has no scope  |
      | matrixDenyAll | role | deny   | party.person.get                      | *             | every record but the hole  |
      | matrixAll     | role | allow  | matrixView                            | *             | every read it holds        |
      | matrixNorth   | role | allow  | party.consent.get                     | Amy marketing | admits that one consent    |
      | matrixAxis    | role | allow  | party.consent.get                     | North         | no scope set: cannot match |
      | testAdmin     | user | allow  | party.consent.find, party.consent.get | * | the harness reads the ids |
    And the ACL consents are
      | record        | kind    | belongsTo | notes                                 |
      | Amy marketing | consent | Amy       | matrixNorth is allowed this record    |
      | Beta research | consent | Dee       | nobody but the wildcard rule names it |
      | Cam study     | consent | Cam       | the scope rule steps past it          |

  Scenario: The party.person.get access matrix
    Then the party.person.get access matrix is
      | viewer          | Amy | Ben | Cam | Dee | Fay | Gil | Hal | Ivy | notes                                           |
      | Axis            | ·   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | Organization Axis — North and South inside it   |
      | ├── Axis HQ     | ·   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | North and South are isPartOf Axis HQ            |
      | │   ├── North   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | Amy, Ben, Ivy → matrixNorth ↦ North             |
      | │   │   ├── Amy | ✅  | ✅  | ❌  | ❌  | ❌  | ❌  | ✅  | ✅  | implicit grant on North; deny on Hal ignored   |
      | │   │   ├── Ben | ✅  | ✅  | ❌  | ❌  | ❌  | ❌  | ✅  | ✅  | implicit grant on North; deny on Hal ignored   |
      | │   │   └── Ivy | ❌  | ❌  | ❌  | ❌  | ❌  | ❌  | ✅  | ❌  | wildcard deny: the hole on Hal alone           |
      | │   └── South   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | Cam → matrixAxis ↦ Axis HQ; Fay → matrixNone   |
      | │       ├── Cam | ✅  | ❌  | ✅  | ❌  | ✅  | ❌  | ✅  | ✅  | in scope; Ben denied by a record rule          |
      | │       └── Fay | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | 🚫  | matrixNone: no party.person.get                |
      | Beta            | ·   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | Organization Beta                               |
      | └── East        | ·   | ·   | ·   | ·   | ·   | ·   | ·   | ·   | Dee → matrixEast; Gil → matrixAll               |
      |     ├── Dee     | ❌  | ❌  | ❌  | ✅  | ❌  | ✅  | ✅  | ❌  | implicit grant on East                         |
      |     └── Gil     | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | matrixAll: wildcard allow on every record      |

  Scenario: The access.acl.get matrix — the rules themselves, no guard at all
    # One column per target a rule names, as the ACL page labels it: the record
    # rule that takes Ben back, the record rule naming Hal, and the wildcard the
    # two all-record rules share.  (A role's scope is a grant on the role, not a
    # rule target, so North and Axis HQ are not columns here.)  access.acl is
    # seeded in this suite and declares no acl block, so the same seven viewers
    # read every one of these rules — that declaration is the only difference from
    # the matrix above.
    Then the access.acl.get access matrix is
      | viewer | Ben | Hal | (all records) | notes                                              |
      | Amy    | ✅  | ✅  | ✅            | the deny on Hal is readable by its target too       |
      | Ben    | ✅  | ✅  | ✅            | the rule that takes Ben back is readable by Ben     |
      | Ivy    | ✅  | ✅  | ✅            | her deny names party.person.get, not this table     |
      | Cam    | ✅  | ✅  | ✅            | her record exemption is public                      |
      | Fay    | 🚫  | 🚫  | 🚫            | matrixNone: no access.acl.get (the only refusal)    |
      | Dee    | ✅  | ✅  | ✅            |                                                     |
      | Gil    | ✅  | ✅  | ✅            | the wildcard allow is not what admits this read     |

  Scenario: The party.consent.get matrix — explicit mode, where a rule is the only way in
    # party.consent declares acl: {mode: 'explicit'} in meta/db/db.ts, so the
    # fixtures below are the entire access: matrixNorth holds one record rule,
    # matrixAxis holds a scope rule for a table that declares no scopes of its
    # own — a scope target with no scope set to match, so it admits nothing —
    # and every other viewer is left to the default refusal.  Dee owns a consent
    # and still may not read it.
    Then the party.consent.get access matrix is
      | viewer | Amy marketing | Beta research | Cam study | notes                                      |
      | Amy    | ✅            | ❌            | ❌        | matrixNorth admits that one record         |
      | Ben    | ✅            | ❌            | ❌        | the same role, so the same one record      |
      | Ivy    | ✅            | ❌            | ❌        |                                            |
      | Cam    | ❌            | ❌            | ❌        | her allow names a scope: no scope set here |
      | Fay    | 🚫            | 🚫            | 🚫        | matrixNone: no party.consent.get           |
      | Dee    | ❌            | ❌            | ❌        | owns a consent, still may not read it      |
      | Gil    | ✅            | ✅            | ✅        | the wildcard allow reaches every row       |
`;
