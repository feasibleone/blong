/**
 * Organization CRUD — Browse, Create, Edit full-stack tests.
 *
 * Covers text, date, and textarea widget types.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, createAndEditModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Party Organization', () => {
    browseModel(test, expect, {
        subject: 'party',
        object: 'organization',
        searchText: 'Global Bank',
    });

    createAndEditModel(test, expect, {
        subject: 'party',
        object: 'organization',
        fields: {
            'organization.legalName': 'Test Playwright Organization',
            'organization.tradingName': 'TestOrg PW',
            'organization.registrationNumber': 'REG-PW-00001',
            'organization.taxId': 'TX-PW-0000000',
            'organization.establishedDate': '01/01/2020',
            'organization.industry': 'Technology',
            'organization.website': 'https://testplaywright.example.com',
            'organization.notes': 'A test organization created by Playwright',
        },
        editFields: {
            'organization.legalName': 'Test Playwright Organization Edited',
        },
    });
});
