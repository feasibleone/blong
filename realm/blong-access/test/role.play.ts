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
            'role.roleBit': 999,
            'role.description': 'ACC-PLAY role',
        },
        editFields: {
            'role.description': 'ACC-PLAY role edited',
        },
        search: 'ACC-PLAY',
        // Capability pivot over the access.capability dropdown — assignment via
        // the `granted` boolean cell; edit-on-detail unticks it.
        details: [
            {
                object: 'capability',
                pivot: true,
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
