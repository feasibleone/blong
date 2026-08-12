/**
 * Gateway Subscription management UI — Browse, Create, Edit full-stack tests.
 *
 * Subscriptions link an application to a bundle.  The generic CRUD `add`
 * auto-generates the `subscriptionId` UUID (PK is `type.uuid()`); the
 * application/bundle fields are dropdowns fed by `gateway.dropdown.list`.
 *
 * Test-created subscriptions use status "suspended"; `cleanupModel` removes
 * previous runs' rows via the browse page filter (runs first, in declaration
 * order) and the browse screenshot filters to "active" seeded rows, so the DB
 * does not need recreating between runs.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Gateway Subscription', () => {
    // Remove test-created rows from previous runs (first test in this file), so
    // the DB does not need to be recreated between runs.
    cleanupModel(test, expect, {
        subject: 'gateway',
        object: 'subscription',
        search: 'suspended',
        removeMethod: 'gateway.subscription.remove',
    });

    // Browse screenshot filters to the seeded active subscriptions.
    browseModel(test, expect, {
        subject: 'gateway',
        object: 'subscription',
        searchText: 'active',
    });

    // test-app → Customer API is not seeded; "suspended" marks the row for
    // cleanup and keeps it out of the "active" browse screenshot.
    createAndEditModel(test, expect, {
        subject: 'gateway',
        object: 'subscription',
        fields: {
            'subscription.applicationId': 'test-app',
            'subscription.bundleId': 'Customer API',
            'subscription.status': 'suspended',
            'subscription.startsAt': '01/01/2000',
        },
        // Edit the created (suspended) subscription's start date.  The status
        // SelectButton is left untouched (its interaction is flaky), and
        // editInCreate: false keeps the created row at its create default so
        // the edit test can change the date to a distinct value.
        editFields: {
            'subscription.startsAt': {widget: 'date', value: '02/01/2000'},
        },
        editInCreate: false,
        search: 'suspended',
    });
});
