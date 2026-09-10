/**
 * Coral CRUD — Browse, Create, Edit full-stack tests.
 *
 * Covers every widget type: text, select, dropdown, number, checkbox, date, textarea.
 * Widget types are auto-detected from the DOM — no explicit `widget:` needed.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Marine Coral', () => {
    browseModel(test, expect, {
        subject: 'marine',
        object: 'coral',
        searchText: 'Staghorn',
    });

    createAndEditModel(test, expect, {
        subject: 'marine',
        object: 'coral',
        fields: {
            'coral.coralName': 'Test Playwright Coral',
            'coral.coralType': 'Soft Coral',
            'coral.familyId': 'Gorgoniidae',
            'coral.habitatId': 'Coral Triangle',
            'coral.maxDepth': 25,
            'coral.colorPattern': 'Purple and white',
            'coral.conservationStatus': 'Near Threatened',
            'coral.isEndangered': true,
            'coral.discoveryDate': '06/15/2024',
            'coral.coralDescription': 'A test coral created by Playwright',
        },
        editFields: {
            'coral.coralName': 'Test Playwright Coral Edited',
        },
    });
});
