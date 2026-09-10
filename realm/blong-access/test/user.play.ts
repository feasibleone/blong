/**
 * `access.user` CRUD — Browse, Create, Edit full-stack tests.
 *
 * `cleanupModel` removes test-created rows (`ACC-PLAY-*`) left from previous
 * runs; `browseModel` filters to the seeded `testAdmin` marker so created rows
 * never leak into the baseline screenshot.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access User', () => {
    cleanupModel(test, expect, {
        subject: 'access',
        object: 'user',
        search: 'ACC-PLAY',
        removeMethod: 'access.user.remove',
    });

    browseModel(test, expect, {
        subject: 'access',
        object: 'user',
        searchText: 'testAdmin',
    });

    createAndEditModel(test, expect, {
        subject: 'access',
        object: 'user',
        fields: {
            'user.emailAddress': 'ACC-PLAY-001@example.com',
            'user.isActive': true,
        },
        editFields: {
            'user.emailAddress': 'ACC-PLAY-001-edited@example.com',
        },
        search: 'ACC-PLAY-001',
        // Credential (editable detail table) + role (pivot over the access.role
        // dropdown — assignment via the `granted` boolean cell).
        details: [
            {
                object: 'credential',
                fields: {
                    credentialType: {widget: 'select', value: 'Password'},
                    isActive: {widget: 'checkbox', value: true},
                },
                // Edit-on-detail: toggle the loaded credential's active flag.
                editFields: {isActive: {widget: 'checkbox', value: false}},
            },
            {
                object: 'role',
                pivot: true,
                fields: {granted: true},
            },
        ],
    });
});
