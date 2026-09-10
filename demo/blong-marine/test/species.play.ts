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
    });
});
