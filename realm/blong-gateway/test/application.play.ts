/**
 * Gateway Application management UI — Browse, Create, Edit full-stack tests.
 *
 * Applications are `core.resource`-backed; the generic CRUD `add` auto-generates
 * the `applicationId` UUID + backing `core_resource` row (PK is `type.uuid()`),
 * so create/edit work through the management form.  Test-created applications
 * carry a "Playwright" description marker; `cleanupModel` removes previous runs'
 * rows via the browse page filter (runs first, in declaration order), so the DB
 * does not need recreating between runs, and the browse screenshot filters to
 * the seeded demo-app.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Gateway Application', () => {
    // Remove test-created rows from previous runs (first test in this file), so
    // the DB does not need to be recreated between runs.
    cleanupModel(test, expect, {
        subject: 'gateway',
        object: 'application',
        search: 'Playwright',
        removeMethod: 'gateway.application.remove',
    });

    // Browse screenshot filters to the seeded demo-app so it stays stable
    // regardless of any test-created rows.
    browseModel(test, expect, {
        subject: 'gateway',
        object: 'application',
        searchText: 'demo',
    });

    createAndEditModel(test, expect, {
        subject: 'gateway',
        object: 'application',
        fields: {
            'application.applicationType': 'OAuth2 Client',
            'application.description': 'A test application created by Playwright',
            'application.isActive': true,
        },
        editFields: {
            'application.description': 'Edited by Playwright',
        },
        search: 'Playwright',
    });
});
