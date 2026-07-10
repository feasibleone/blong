/**
 * Org Unit CRUD — Browse, Create, Edit full-stack tests.
 *
 * Tests text, select, and textarea widget types.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Party Org Unit', () => {
    browseModel(test, expect, {
        subject: 'party',
        object: 'orgUnit',
        searchText: 'Retail Banking',
    });

    createAndEditModel(test, expect, {
        subject: 'party',
        object: 'orgUnit',
        fields: {
            'orgUnit.unitName': 'Test Playwright Unit',
            'orgUnit.unitType': 'Team',
            'orgUnit.notes': 'A test org unit created by Playwright',
        },
        editFields: {
            'orgUnit.unitName': 'Test Playwright Unit Edited',
        },
    });
});
