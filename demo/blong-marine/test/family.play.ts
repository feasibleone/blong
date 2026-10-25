/**
 * Family CRUD — Browse, Create, Edit full-stack tests.
 *
 * Tests text and textarea widget types.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Marine Family', () => {
    browseModel(test, expect, {
        subject: 'marine',
        object: 'family',
        searchText: 'Acroporidae',
    });

    createAndEditModel(test, expect, {
        subject: 'marine',
        object: 'family',
        fields: {
            'family.familyName': 'Test Playwright Family',
            'family.order': 'Testiformes',
            'family.class': 'Testotheca',
            'family.familyDescription': 'A test family created by Playwright',
        },
        editFields: {
            'family.familyName': 'Test Playwright Family Edited',
        },
        // Pin the edit test to the family this spec created. Without it the edit test
        // opens the first row of the unfiltered family table — a *seeded* family
        // (`Acroporidae`, the one `Staghorn Coral` belongs to) — and renames it. The
        // rename lands in the shared model mock, so every later capture that shows the
        // family tree or a species' `familyId` label sees the edited name instead: that
        // is what took `species.play.ts` and `portal.play.ts` red whenever the family
        // spec happened to run first.
        search: 'Test Playwright Family',
    });
});
