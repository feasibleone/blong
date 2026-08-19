/**
 * `access.capability` CRUD — Browse, Create, Edit full-stack tests.
 *
 * `capabilityName` lives in `core_resource.resourceName` (provided by the
 * custom `access.capability.find`); the browse `search` runs against the
 * `description` string column, so created rows carry an `ACC-PLAY` marker there.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Capability', () => {
    cleanupModel(test, expect, {
        subject: 'access',
        object: 'capability',
        search: 'ACC-PLAY',
        removeMethod: 'access.capability.remove',
    });

    browseModel(test, expect, {
        subject: 'access',
        object: 'capability',
        searchText: 'testManagement',
    });

    createAndEditModel(test, expect, {
        subject: 'access',
        object: 'capability',
        fields: {
            'capability.capabilityName': 'ACC-PLAY-Capability',
            'capability.description': 'ACC-PLAY capability',
        },
        editFields: {
            'capability.description': 'ACC-PLAY capability edited',
        },
        search: 'ACC-PLAY',
        // Action pivot (entity rows + CRUD boolean cells) — tick find+add on the
        // first entity row on create and untick add on edit; the "Other Actions"
        // card renders inside the same Action tab (covered by the tab screenshots).
        details: [
            {
                object: 'action',
                pivot: true,
                fields: {find: true, add: true},
                editFields: {add: false},
            },
        ],
    });
});
