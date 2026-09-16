/**
 * Organization CRUD — Browse, Create, Edit full-stack tests.
 *
 * `party.organization` is guarded by a record-level ACL whose scope *is* the
 * organization (units point at it, `selfScope`).  The Admin role carries the
 * wildcard allow-all rule the access realm seeds, so an organization it creates
 * stays readable — that is what makes the create flow work.
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
        search: 'Test Playwright',
    });
});
