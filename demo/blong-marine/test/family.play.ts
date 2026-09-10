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
    });
});
