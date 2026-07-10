/**
 * Person CRUD — Browse, Create, Edit full-stack tests.
 *
 * Covers text, select (gender, marital status), date, and textarea widget types.
 * Widget types are auto-detected from the DOM — no explicit `widget:` needed.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Party Person', () => {
    browseModel(test, expect, {
        subject: 'party',
        object: 'person',
        searchText: 'Doe',
    });

    createAndEditModel(test, expect, {
        subject: 'party',
        object: 'person',
        fields: {
            'person.firstName': 'Test',
            'person.middleName': 'Playwright',
            'person.lastName': 'Person',
            'person.birthDate': '06/15/1990',
            'person.gender': 'Male',
            'person.maritalStatus': 'Single',
            'person.nationality': 'US',
            'person.occupation': 'Test Engineer',
            'person.notes': 'A test person created by Playwright',
        },
        editFields: {
            'person.firstName': 'Test Edited',
            'person.lastName': 'Person Edited',
        },
    });
});
