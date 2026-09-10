/**
 * Gateway Bundle management UI — Browse, Create, Edit full-stack tests.
 *
 * Bundles wrap an `access.role` (bundleId === roleId), so create goes through
 * the custom `gateway.bundle.add` handler which creates the role + bundle row.
 * Test-created bundles carry a "Playwright" description marker; `cleanupModel`
 * removes previous runs' rows via the browse page filter (runs first, in
 * declaration order), and the browse screenshot filters to the seeded Vision
 * AI bundle.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Gateway Bundle', () => {
    // Remove test-created rows from previous runs (first test in this file), so
    // the DB does not need to be recreated between runs.
    cleanupModel(test, expect, {
        subject: 'gateway',
        object: 'bundle',
        search: 'Playwright',
        removeMethod: 'gateway.bundle.remove',
    });

    // Browse screenshot filters to the seeded Vision AI bundle so it stays
    // stable regardless of any test-created rows.
    browseModel(test, expect, {
        subject: 'gateway',
        object: 'bundle',
        searchText: 'Vision',
    });

    createAndEditModel(test, expect, {
        subject: 'gateway',
        object: 'bundle',
        fields: {
            'bundle.baseMonthlyCredits': 1000,
            'bundle.rateLimit': 50,
            'bundle.rateWindowSec': 60,
            'bundle.description': 'A test bundle created by Playwright',
            'bundle.isActive': true,
        },
        editFields: {
            'bundle.description': 'Edited by Playwright',
        },
        search: 'Playwright',
    });
});
