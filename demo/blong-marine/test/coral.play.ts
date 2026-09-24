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
        // Pin the edit test to the record this spec created. Without it the edit
        // test opens the first row of the unfiltered table — which is the only
        // coral the demo database seeds (`Staghorn Coral`, `marineCoralMerge.yaml`)
        // — and renames it, taking that record away from `docs.play.ts` (F-255).
        search: 'Test Playwright Coral',
        // The created coral is a Gorgoniidae, and the table shows the branch the
        // navigator has selected — its first family by default.
        navigatorNode: 'Gorgoniidae',
    });
});
