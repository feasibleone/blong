/**
 * Unit CRUD — Browse, Create, Edit full-stack tests.
 *
 * Tests text, select, and textarea widget types.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Party Unit', () => {
    browseModel(test, expect, {
        subject: 'party',
        object: 'unit',
        searchText: 'Retail Banking',
    });

    createAndEditModel(test, expect, {
        subject: 'party',
        object: 'unit',
        fields: {
            'unit.unitName': 'Test Playwright Unit',
            'unit.unitType': 'Team',
            'unit.notes': 'A test unit created by Playwright',
        },
        editFields: {
            'unit.unitName': 'Test Playwright Unit Edited',
        },
    });
});
