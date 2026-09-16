/**
 * `access.role` — the **Record Access** matrix (the ACL pivot).
 *
 * The generic `createAndEditModel` helper drives the captures; this spec only
 * adds what the matrix needs to be deterministic. Two things are specific:
 *
 * 1. **The row set is filtered.** The matrix rows are the whole
 *    `access.aclTarget` dropdown — every role, user and organization in the
 *    graph — so an unfiltered capture drifts with whatever else the database
 *    holds (other specs, leftovers from earlier runs). The `filters` declaration
 *    narrows the grid to the `all: (all records)` wildcard row, which is the
 *    tri-state evidence row: `find` cycled to Allow, `get` cycled to Deny and
 *    the remaining verbs left blank, with no row-edit column (every editable
 *    column of the pivot is a click-to-cycle cell).
 * 2. **The run ends with the cells released.** The edit phase clears both cells
 *    back to "Not set", so the role owns no `access_acl` rows afterwards and the
 *    suite's `cleanupModel` can delete it — a stored rule would trip the
 *    `access_acl` foreign key and leave the role behind to pollute the next run.
 *    The *persisted* state is still evidenced: `-tab-matrix-open` captures the
 *    matrix of the loaded role, showing the Allow/Deny written by the create
 *    phase.
 *
 * The matrix write/load/enforce path is additionally proved end-to-end by
 * `test.acl.flow` (steps 14-16) in `realm/blong-party`.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

const ROLE_NAME = 'ACC-PLAY-Matrix';

test.describe('Access Role · Record Access matrix', () => {
    createAndEditModel(test, expect, {
        subject: 'access',
        object: 'role',
        fields: {
            'role.roleName': ROLE_NAME,
            // `access_role.roleBit` is UNIQUE and the default 0 is already taken
            // by a seeded role: the insert would be silently ignored (MySQL
            // `INSERT IGNORE`) and the role row would never exist — a resource
            // without a role, which the browse cannot even show.  The role spec
            // uses 999; the matrix takes the next free bit.
            'role.roleBit': 998,
            'role.description': 'ACC-PLAY matrix role',
        },
        editFields: {
            'role.description': 'ACC-PLAY matrix role edited',
        },
        // Its own baseline names — `role.play.ts` drives the same entity.
        baselinePrefix: 'access-role-matrix',
        // The edit test opens its row through the role browse filter: without
        // this it would open whichever role happens to be listed first and
        // capture *that* role's matrix.  The text matches this role only (the
        // other specs' descriptions carry 'ACC-PLAY role', not 'matrix role').
        search: 'matrix role',
        details: [
            {
                object: 'matrix',
                tab: 'Record Access',
                pivot: true,
                // Narrow the grid to the wildcard scope: the matrix otherwise
                // lists every role, user and organization in the graph.
                filters: {targetName: '(all records)'},
                // Tri-state evidence in one row: `find` cycled to allow, `get`
                // cycled to deny and the remaining verbs left blank.  The entity
                // comes from the pivot defaults, so no row-edit mode is involved.
                fields: {
                    find: {widget: 'cycle', value: 'Allow'},
                    get: {widget: 'cycle', value: 'Deny'},
                },
                // Editing proof: the loaded allow/deny are cycled back to "Not
                // set", which also releases the ACL rules so the role stays
                // deletable.  The load itself is the `-tab-matrix-open` capture.
                editFields: {
                    find: {widget: 'cycle', value: 'Not set'},
                    get: {widget: 'cycle', value: 'Not set'},
                },
            },
        ],
    });
});
