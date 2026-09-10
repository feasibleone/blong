/**
 * `access.action` browse-only view — the actions table is not editable from the
 * UI, only a Browse page (with `actionName` joined from core_resource) is
 * asserted.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Action', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'action',
        searchText: 'accessTestPrivate',
    });
});
