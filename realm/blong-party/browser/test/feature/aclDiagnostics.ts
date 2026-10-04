/**
 * ACL matrix diagnostics — the failure has to be readable.
 *
 * A matrix is only worth its green run if a red one tells you which cell is wrong
 * and why, so the report is a contract rather than a side effect: the table is
 * redrawn with the offending cell marked `expected≠actual`, and every mismatch is
 * also named (row, column, both values) underneath it.  These scenarios hold that
 * contract in place — they drive the real `aclMatrix` (`party.person.get`) and the
 * real `aclFixture` (`party.fixture.get`) with a **deliberately wrong** table and
 * assert that the report marks each mismatch *in the cell it belongs to*, then
 * that a table with nothing wrong reports nothing.
 *
 * They are a feature file rather than a unit test on purpose: what is being
 * asserted is the whole path a reader sees — the probe through the gateway, the
 * comparison, the redraw and the assertion message tap prints.
 *
 * Asserted by `browser/test/test/testAclDiagnostics.ts`
 * (group `test.acl.diagnostics`), which runs in every suite run.
 */
export default `Feature: ACL matrix diagnostics — a failure has to be readable

  Scenario: A wrong matrix cell is marked where the reader looks
    # Amy may read herself and Ben (both are in North); Cam is in South, so the
    # cell below is wrong on purpose.
    Then probing the access matrix reports every mismatch in its own cell
      | viewer | Amy | Ben | Cam | notes               |
      | Amy    | ✅  | ✅  | ✅  | Cam is out of scope |

  Scenario: A wrong fixture row is marked where the reader looks
    # North belongs to Axis; the table claims Beta, so the row is wrong on purpose.
    Then probing the ACL fixture reports every mismatch in its own cell
      | record | kind | belongsTo | notes       |
      | North  | unit | Beta      | really Axis |

  Scenario: A table with nothing wrong reports nothing
    Then probing the access matrix reports no mismatch
      | viewer | Amy | Ben | Cam |
      | Amy    | ✅  | ✅  | ❌  |
`;
