/**
 * Person CRUD — Browse, Create, Edit full-stack tests.
 *
 * Covers text, select (gender, marital status), date, and textarea widget types.
 * Widget types are auto-detected from the DOM — no explicit `widget:` needed.
 *
 * Every test that touches a record pins it by this spec's own marker, `Playwright`.
 * The edit test used to open the **first row of the table**, which is whichever
 * person the database happens to answer first — a person the google-login spec had
 * created in one run, a seeded `Ahmed Hassan` in the next — so its capture compared
 * two different records and failed on data rather than on layout (`F-610`).
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
            // The full name is the row's display name and its searchable key: the
            // other parts alone leave the record unnamed in every table it appears in.
            'person.personName': 'Test Playwright Person',
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
        // Open *this* spec's record, not the first row the table answers with.
        search: 'Test Playwright',
    });
});
