/**
 * Habitat CRUD — Browse, Create, Edit full-stack tests.
 *
 * Tests text, select (multiple on one form), and textarea widget types.
 * Select values are chosen to be unique across all SelectButton widgets
 * on the same form to avoid ambiguous substring matches.
 */
import {test, expect} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Marine Habitat', () => {
    browseModel(test, expect, {
        subject: 'marine',
        object: 'habitat',
        searchText: 'Reef',
    });

    createAndEditModel(test, expect, {
        subject: 'marine',
        object: 'habitat',
        fields: {
            'habitat.habitatName': 'Test Playwright Habitat',
            'habitat.habitatType': 'Atoll',
            'habitat.zone': 'Mesophotic',
            'habitat.oceanZone': 'Twilight',
            'habitat.region': 'Test Pacific',
            'habitat.description': 'A test habitat created by Playwright',
        },
        editFields: {
            'habitat.habitatName': 'Test Playwright Habitat Edited',
        },
    });
});
