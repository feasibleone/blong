/**
 * Species CRUD — Browse, Create, Edit full-stack tests.
 *
 * Tests text, dropdown, select, and textarea widget types.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Marine Species', () => {
    browseModel(test, expect, {
        subject: 'marine',
        object: 'species',
        searchText: 'Clown',
    });

    createAndEditModel(test, expect, {
        subject: 'marine',
        object: 'species',
        fields: {
            'species.speciesName': 'Test Playwright Species',
            'species.scientificName': 'Testus playwrightus',
            'species.genus': 'Testus',
            'species.species': 'playwrightus',
            'species.familyId': 'Gorgoniidae',
            'species.conservationStatus': 'Vulnerable',
            'species.speciesDescription': 'A test species created by Playwright',
        },
        editFields: {
            'species.speciesName': 'Test Playwright Species Edited',
        },
        // Pin the edit test to the species this spec created, for the reason
        // `family.play.ts` pins its own: without it the edit test opens the first row
        // of the unfiltered table — the seeded `Clownfish` — and renames it, so every
        // later capture of the species list shows a test name (F-255).
        search: 'Test Playwright Species',
        // The species table renders the branch the navigator has selected, and the
        // navigator auto-selects its first loaded family (`Acroporidae`). The record
        // this spec creates is a `Gorgoniidae`, so that branch has to be selected
        // first — a search only narrows the table, it never widens the branch.
        navigatorNode: 'Gorgoniidae',
    });
});
