/**
 * `access.access` browse-only view — access rules are not seeded and not
 * editable from the UI; the Browse page (empty state) is asserted.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Access Rule', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'access',
    });
});
