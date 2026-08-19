/**
 * `access.policy` browse-only view — credential policies are not editable from
 * the UI, only a Browse page is asserted.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Policy', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'policy',
        searchText: 'password',
    });
});
