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
        search: 'ACC-PLAY',
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
            // Just above the six seeded roles (0-5).  A bit is a position in a
            // token's permission mask, so the allocator never hands a freed value
            // out again and it hands out `max(high-water mark, MAX(roleBit)) + 1`:
            // a pin at 999 lifts that mark to 1000 the moment anything allocates
            // while the row exists, which burns the space down to the 1023 ceiling
            // in a few runs (F-298).  This one costs nothing the seeds have not
            // already spent, and the role is deleted by the cleanup below.
            'role.roleBit': 6,
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
