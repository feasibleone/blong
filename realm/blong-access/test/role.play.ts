/**
 * `access.role` CRUD — Browse, Create, Edit full-stack tests.
 *
 * The `roleName` display name lives in `core_resource.resourceName` (provided
 * by the custom `access.role.find`), while the browse `search` runs against the
 * `description` string column — so the created rows carry an `ACC-PLAY` marker
 * in their description for reliable cleanup + edit targeting.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Role', () => {
    cleanupModel(test, expect, {
        subject: 'access',
        object: 'role',
        search: 'ACC-PLAY-Matrix',
        removeMethod: 'access.role.remove',
    });

    browseModel(test, expect, {
        subject: 'access',
        object: 'role',
        searchText: 'Admin',
    });

    createAndEditModel(test, expect, {
        subject: 'access',
        object: 'role',
        fields: {
            'role.roleName': 'ACC-PLAY-Role',
            // A pinned bit comes from the band reserved for fixtures (500+), never
            // from the low range the seeds allocate: every realm contributes four
            // roles of its own, so 6 — which used to be just above the seeded 0-5 —
            // became `Access Admin` and the create failed on `role.bitTaken`
            // (`@@D-778`).  The pin is what keeps this spec's capture
            // deterministic, and a high one is what F-298 warns against (a pin
            // lifts the allocator's high-water mark, so an ever-higher one burns
            // the space down to the 1023 ceiling) — 500 is above anything the
            // seeds reach and far below the ceiling.  The role is deleted by the
            // cleanup above, and its bit is not re-issued.
            'role.roleBit': 500,
            'role.description': 'ACC-PLAY role',
        },
        editFields: {
            'role.description': 'ACC-PLAY role edited',
        },
        search: 'ACC-PLAY',
        // Capability pivot over the access.capability dropdown — assignment via
        // the `granted` boolean cell; edit-on-detail unticks it.  The rows are the
        // whole dropdown in whatever order the database returns them, and the cell
        // the spec ticks belongs to the *first* row: an unfiltered pivot granted
        // `guestBasic` in one run and `accessModelAdmin` in the next, and the
        // difference sat inside the diff tolerance, so the capture quietly showed
        // the wrong row (T-173's defect, and the reason `user.play.ts` names its
        // role).  Naming the capability keeps the row and the tick the same.
        details: [
            {
                object: 'capability',
                pivot: true,
                filters: {capabilityName: 'guestBasic'},
                fields: {granted: true},
                editFields: {granted: false},
            },
            // The effective-ACL panel is view-only (`actions.allowAdd: false`).
            // The Record Access matrix is *not* captured here: its rows are the
            // graph's roles and users, so its content shifts as other specs create
            // and delete them — it has its own spec (`matrix.play.ts`).
            {object: 'effective', tab: 'Access', allowAdd: false, screenshots: {empty: false}},
        ],
    });
});
